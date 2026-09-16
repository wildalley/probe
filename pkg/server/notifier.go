package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"probe/pkg/model"
)

// Notifier handles multi-channel alerts and scheduled traffic reports.
type Notifier struct {
	storage        *Storage
	hub            *Hub
	httpClient     *http.Client
	mu             sync.RWMutex
	settings       model.NotificationSettings
	trafficAlerted map[string]int64 // nodeID -> last alert timestamp
	offlineTrack   map[string]int64 // nodeID -> timestamp marked offline
	lastReportDate string           // e.g. "2026-09-15"
}

// NewNotifier creates an instance of Notifier.
func NewNotifier(storage *Storage, hub *Hub) *Notifier {
	n := &Notifier{
		storage: storage,
		hub:     hub,
		// Webhook and Discord URLs are operator input, so every outbound call
		// here dials through the guard that refuses internal address ranges.
		httpClient:     newGuardedHTTPClient(12 * time.Second),
		trafficAlerted: make(map[string]int64),
		offlineTrack:   make(map[string]int64),
	}

	n.ReloadSettings()
	return n
}

// ReloadSettings refreshes notification settings from storage.
func (n *Notifier) ReloadSettings() {
	if s, err := n.storage.GetNotificationSettings(); err == nil && s != nil {
		n.mu.Lock()
		n.settings = *s
		n.mu.Unlock()
	}
}

// GetSettings returns a copy of current settings.
func (n *Notifier) GetSettings() model.NotificationSettings {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.settings
}

// Start launches the background scheduler for daily reports and health monitoring.
func (n *Notifier) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n.checkDailyReportSchedule()
		}
	}
}

// checkDailyReportSchedule inspects whether it's time to send the daily traffic & status summary.
func (n *Notifier) checkDailyReportSchedule() {
	n.mu.RLock()
	rules := n.settings.Rules
	lastDate := n.lastReportDate
	n.mu.RUnlock()

	if !rules.DailyReport || rules.DailyReportTime == "" {
		return
	}

	now := time.Now()
	todayStr := now.Format("2006-01-02")
	if lastDate == todayStr {
		return // already sent today
	}

	targetTime := rules.DailyReportTime // e.g. "09:00"
	parts := strings.Split(targetTime, ":")
	if len(parts) != 2 {
		return
	}

	targetHour, targetMin := parts[0], parts[1]
	currentHour := fmt.Sprintf("%02d", now.Hour())
	currentMin := fmt.Sprintf("%02d", now.Minute())

	if currentHour == targetHour && currentMin == targetMin {
		n.mu.Lock()
		n.lastReportDate = todayStr
		n.mu.Unlock()

		go n.SendDailyReport()
	}
}

// NotifyNodeOffline triggers offline notification if enabled.
func (n *Notifier) NotifyNodeOffline(node *model.NodeState) {
	n.mu.Lock()
	n.offlineTrack[node.NodeID] = time.Now().Unix()
	enabled := n.settings.Rules.OfflineAlert
	n.mu.Unlock()

	if !enabled {
		return
	}

	title := fmt.Sprintf("🚨 节点离线告警: %s", node.Name)
	content := fmt.Sprintf("⚠️ 监测到探针节点已失联！\n• 节点名称: %s\n• 节点 ID: %s\n• 部署地区: %s\n• 最后活跃: %s\n• 状态: 异常中断",
		node.Name,
		node.NodeID,
		node.Region,
		time.Unix(node.LastSeen, 0).Format("2006-01-02 15:04:05"),
	)

	go n.dispatchAll("offline", title, content)
}

// NotifyNodeRecovery triggers recovery notification if node was previously offline.
func (n *Notifier) NotifyNodeRecovery(node *model.NodeState) {
	n.mu.Lock()
	offlineTime, wasOffline := n.offlineTrack[node.NodeID]
	delete(n.offlineTrack, node.NodeID)
	enabled := n.settings.Rules.RecoveryAlert
	n.mu.Unlock()

	if !wasOffline || !enabled {
		return
	}

	offlineDuration := time.Now().Unix() - offlineTime
	durStr := formatDuration(offlineDuration)

	title := fmt.Sprintf("✅ 节点上线恢复: %s", node.Name)
	content := fmt.Sprintf("🎉 探针节点已恢复连接并正常上报！\n• 节点名称: %s\n• 节点 ID: %s\n• 部署地区: %s\n• 离线时长: %s\n• 恢复时间: %s",
		node.Name,
		node.NodeID,
		node.Region,
		durStr,
		time.Now().Format("2006-01-02 15:04:05"),
	)

	go n.dispatchAll("recovery", title, content)
}

// CheckTrafficQuota verifies bandwidth usage against configured quota thresholds.
func (n *Notifier) CheckTrafficQuota(node *model.NodeState) {
	quota := node.Billing.BandwidthQuota
	used := node.Billing.BandwidthUsed
	if quota == 0 || used == 0 {
		return
	}

	n.mu.RLock()
	rules := n.settings.Rules
	lastAlert := n.trafficAlerted[node.NodeID]
	n.mu.RUnlock()

	if !rules.TrafficAlert {
		return
	}

	threshold := float64(rules.TrafficThresholdPct)
	if threshold <= 0 {
		threshold = 85.0
	}

	percent := (float64(used) / float64(quota)) * 100.0
	if percent < threshold {
		return
	}

	// 12 hours cooldown to avoid notification storms
	if time.Now().Unix()-lastAlert < 12*3600 {
		return
	}

	n.mu.Lock()
	n.trafficAlerted[node.NodeID] = time.Now().Unix()
	n.mu.Unlock()

	title := fmt.Sprintf("⚠️ 流量预警: %s 额度已消耗 %.1f%%", node.Name, percent)
	content := fmt.Sprintf("📊 节点流量已达到设定的预警警戒线！\n• 节点名称: %s\n• 预警阈值: %.0f%%\n• 已用流量: %s\n• 总流量额度: %s\n• 消耗比例: %.2f%%\n• 触发时间: %s",
		node.Name,
		threshold,
		formatBytes(used),
		formatBytes(quota),
		percent,
		time.Now().Format("2006-01-02 15:04:05"),
	)

	go n.dispatchAll("traffic", title, content)
}

// SendDailyReport compiles the daily server farm digest and broadcasts it.
func (n *Notifier) SendDailyReport() {
	if n.hub == nil {
		return
	}

	states := n.hub.GetAllStates()
	total := len(states)
	online := 0
	offline := 0
	var totalSent uint64
	var totalRecv uint64
	var quotaAlertList []string

	for _, s := range states {
		if s.IsOnline {
			online++
		} else {
			offline++
		}
		totalSent += s.Network.BytesSent
		totalRecv += s.Network.BytesRecv

		if s.Billing.BandwidthQuota > 0 {
			pct := (float64(s.Billing.BandwidthUsed) / float64(s.Billing.BandwidthQuota)) * 100
			if pct >= 80 {
				quotaAlertList = append(quotaAlertList, fmt.Sprintf("%s(%.1f%%)", s.Name, pct))
			}
		}
	}

	quotaNote := "无"
	if len(quotaAlertList) > 0 {
		quotaNote = strings.Join(quotaAlertList, ", ")
	}

	title := fmt.Sprintf("📅 探针监控系统 · 每日运行与流量日报 (%s)", time.Now().Format("2006-01-02"))
	content := fmt.Sprintf(
		"📋 节点运行概览:\n"+
			"• 接入节点总数: %d\n"+
			"• 当前在线: %d 台 | 离线: %d 台\n"+
			"• 全网出网总量 (Tx): %s\n"+
			"• 全网入网总量 (Rx): %s\n"+
			"• 流量超80%%警戒节点: %s\n"+
			"• 报告生成时间: %s",
		total,
		online,
		offline,
		formatBytes(totalSent),
		formatBytes(totalRecv),
		quotaNote,
		time.Now().Format("2006-01-02 15:04:05"),
	)

	n.dispatchAll("daily_report", title, content)
}

// SendTest sends an explicit test message to the selected channel ("telegram", "webhook", "discord", "all").
func (n *Notifier) SendTest(channel string) error {
	title := "🔔 探针自定义通知测试 (Probe Notification Test)"
	content := fmt.Sprintf("这是来自云探针监控平台的测试消息！\n如果您收到此消息，说明该通知通道已配置成功并可正常接收告警推送。\n发送时间: %s",
		time.Now().Format("2006-01-02 15:04:05"),
	)

	n.mu.RLock()
	settings := n.settings
	n.mu.RUnlock()

	var errs []string

	if channel == "telegram" || channel == "all" {
		if settings.Telegram.BotToken != "" && settings.Telegram.ChatID != "" {
			if err := n.sendTelegram(settings.Telegram.BotToken, settings.Telegram.ChatID, title, content); err != nil {
				errs = append(errs, "Telegram: "+err.Error())
				n.logAlert("telegram", "test", title, content, "failed", err.Error())
			} else {
				n.logAlert("telegram", "test", title, content, "success", "")
			}
		} else if channel == "telegram" {
			errs = append(errs, "Telegram 机器人 Token 或 Chat ID 未配置")
		}
	}

	if channel == "webhook" || channel == "all" {
		if settings.Webhook.URL != "" {
			if err := n.sendWebhook(settings.Webhook, title, content); err != nil {
				errs = append(errs, "Webhook: "+err.Error())
				n.logAlert("webhook", "test", title, content, "failed", err.Error())
			} else {
				n.logAlert("webhook", "test", title, content, "success", "")
			}
		} else if channel == "webhook" {
			errs = append(errs, "Webhook URL 未配置")
		}
	}

	if channel == "discord" || channel == "all" {
		if settings.Discord.WebhookURL != "" {
			if err := n.sendDiscord(settings.Discord.WebhookURL, title, content); err != nil {
				errs = append(errs, "Discord: "+err.Error())
				n.logAlert("discord", "test", title, content, "failed", err.Error())
			} else {
				n.logAlert("discord", "test", title, content, "success", "")
			}
		} else if channel == "discord" {
			errs = append(errs, "Discord Webhook URL 未配置")
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("%s", strings.Join(errs, "; "))
	}
	return nil
}

// dispatchAll broadcasts an alert to all enabled channels.
func (n *Notifier) dispatchAll(alertType, title, content string) {
	n.mu.RLock()
	settings := n.settings
	n.mu.RUnlock()

	if settings.Telegram.Enabled && settings.Telegram.BotToken != "" && settings.Telegram.ChatID != "" {
		err := n.sendTelegram(settings.Telegram.BotToken, settings.Telegram.ChatID, title, content)
		if err != nil {
			log.Printf("[Notifier] Telegram dispatch failed: %v", err)
			n.logAlert("telegram", alertType, title, content, "failed", err.Error())
		} else {
			n.logAlert("telegram", alertType, title, content, "success", "")
		}
	}

	if settings.Webhook.Enabled && settings.Webhook.URL != "" {
		err := n.sendWebhook(settings.Webhook, title, content)
		if err != nil {
			log.Printf("[Notifier] Webhook dispatch failed: %v", err)
			n.logAlert("webhook", alertType, title, content, "failed", err.Error())
		} else {
			n.logAlert("webhook", alertType, title, content, "success", "")
		}
	}

	if settings.Discord.Enabled && settings.Discord.WebhookURL != "" {
		err := n.sendDiscord(settings.Discord.WebhookURL, title, content)
		if err != nil {
			log.Printf("[Notifier] Discord dispatch failed: %v", err)
			n.logAlert("discord", alertType, title, content, "failed", err.Error())
		} else {
			n.logAlert("discord", alertType, title, content, "success", "")
		}
	}
}

// sendTelegram sends message to Telegram Bot API.
func (n *Notifier) sendTelegram(botToken, chatID, title, content string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)
	msgText := fmt.Sprintf("*%s*\n\n%s", escapeMarkdown(title), content)

	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       msgText,
		"parse_mode": "Markdown",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := n.httpClient.Post(apiURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// sendDiscord sends message to Discord Webhook.
func (n *Notifier) sendDiscord(webhookURL, title, content string) error {
	if err := validateOutboundURL(webhookURL); err != nil {
		return err
	}
	payload := map[string]interface{}{
		"embeds": []map[string]interface{}{
			{
				"title":       title,
				"description": content,
				"color":       0x6366f1, // Indigo
				"footer": map[string]string{
					"text": "Probe Server Monitoring",
				},
				"timestamp": time.Now().Format(time.RFC3339),
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := n.httpClient.Post(webhookURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// sendWebhook sends payload to generic, Feishu, DingTalk, WeCom, or Bark.
func (n *Notifier) sendWebhook(config model.WebhookConfig, title, content string) error {
	url := strings.TrimSpace(config.URL)
	// The URL is operator-supplied, so reject non-http(s) schemes and literal
	// internal addresses before building the request. Hostnames are caught later
	// by the dialer guard, which sees the resolved address.
	if err := validateOutboundURL(url); err != nil {
		return err
	}
	format := strings.ToLower(strings.TrimSpace(config.Format))
	if format == "" {
		format = "generic"
	}

	var payload interface{}

	switch format {
	case "feishu":
		payload = map[string]interface{}{
			"msg_type": "text",
			"content": map[string]string{
				"text": fmt.Sprintf("%s\n\n%s", title, content),
			},
		}
	case "dingtalk":
		payload = map[string]interface{}{
			"msgtype": "markdown",
			"markdown": map[string]string{
				"title": title,
				"text":  fmt.Sprintf("### %s\n\n%s", title, content),
			},
		}
	case "wecom":
		payload = map[string]interface{}{
			"msgtype": "markdown",
			"markdown": map[string]string{
				"content": fmt.Sprintf("### %s\n\n%s", title, content),
			},
		}
	case "bark":
		payload = map[string]interface{}{
			"title": title,
			"body":  content,
			"group": "Probe",
		}
	default:
		payload = map[string]interface{}{
			"title":     title,
			"content":   content,
			"timestamp": time.Now().Unix(),
			"event":     "probe_alert",
		}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if config.Secret != "" {
		req.Header.Set("Authorization", "Bearer "+config.Secret)
		req.Header.Set("X-Webhook-Secret", config.Secret)
	}

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// logAlert records the alert to SQLite database.
func (n *Notifier) logAlert(channel, alertType, title, content, status, errorMsg string) {
	_ = n.storage.AddNotificationLog(&model.NotificationLog{
		Timestamp: time.Now().Unix(),
		Channel:   channel,
		Type:      alertType,
		Title:     title,
		Content:   content,
		Status:    status,
		ErrorMsg:  errorMsg,
	})
}

func escapeMarkdown(s string) string {
	return strings.NewReplacer(
		"_", "\\_",
		"*", "\\*",
		"[", "\\[",
		"]", "\\]",
		"`", "\\`",
	).Replace(s)
}

func formatDuration(sec int64) string {
	if sec < 60 {
		return fmt.Sprintf("%d 秒", sec)
	}
	if sec < 3600 {
		return fmt.Sprintf("%d 分钟", sec/60)
	}
	hours := sec / 3600
	mins := (sec % 3600) / 60
	return fmt.Sprintf("%d 小时 %d 分钟", hours, mins)
}

func formatBytes(bytes uint64) string {
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
		TB = 1024 * GB
	)
	switch {
	case bytes >= TB:
		return fmt.Sprintf("%.2f TB", float64(bytes)/float64(TB))
	case bytes >= GB:
		return fmt.Sprintf("%.2f GB", float64(bytes)/float64(GB))
	case bytes >= MB:
		return fmt.Sprintf("%.2f MB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.2f KB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}
