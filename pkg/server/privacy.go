package server

import "probe/pkg/model"

// Keep the collected addresses intact for administration, GeoIP and storage.
// Only copies sent to anonymous viewers are redacted.
func nodeStateForViewer(state *model.NodeState, canViewIPs bool) *model.NodeState {
	copy := cloneNodeState(state)
	if copy != nil && !canViewIPs {
		copy.System.PublicIP = ""
		copy.System.PublicIPv6 = ""
	}
	return copy
}

func nodeStatesForViewer(states []*model.NodeState, canViewIPs bool) []*model.NodeState {
	result := make([]*model.NodeState, 0, len(states))
	for _, state := range states {
		result = append(result, nodeStateForViewer(state, canViewIPs))
	}
	return result
}

func eventForGuest(event *model.WSEvent) *model.WSEvent {
	copy := *event
	switch data := event.Data.(type) {
	case *model.NodeState:
		copy.Data = nodeStateForViewer(data, false)
	case []*model.NodeState:
		copy.Data = nodeStatesForViewer(data, false)
	}
	return &copy
}

func rpcResultForViewer(result interface{}, canViewIPs bool) interface{} {
	if nodes, ok := result.(map[string]KomariRpcNode); ok && !canViewIPs {
		redacted := make(map[string]KomariRpcNode, len(nodes))
		for id, node := range nodes {
			node.IPv4 = ""
			node.IPv6 = ""
			redacted[id] = node
		}
		return redacted
	}
	return result
}
