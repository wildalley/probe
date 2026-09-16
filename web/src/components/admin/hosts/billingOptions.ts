/**
 * Currency and billing-cycle choices shared by the host editor and anything
 * else that has to render the same keys the server stores.
 */

export const CURRENCY_OPTIONS = [
  { key: "$", label: "$ (USD - 美元)" },
  { key: "¥", label: "¥ (CNY - 人民币)" },
  { key: "€", label: "€ (EUR - 欧元)" },
  { key: "HK$", label: "HK$ (HKD - 港币)" },
  { key: "£", label: "£ (GBP - 英镑)" },
  { key: "JP¥", label: "JP¥ (JPY - 日元)" },
];

export const BILLING_CYCLE_OPTIONS = [
  { key: "month", label: "按月 (Month)" },
  { key: "quarter", label: "按季 (Quarter)" },
  { key: "half_year", label: "半年 (Half Year)" },
  { key: "year", label: "按年 (Year)" },
  { key: "two_year", label: "两年 (2 Years)" },
  { key: "three_year", label: "三年 (3 Years)" },
  { key: "one_time", label: "一次性 (One-time)" },
];

export const getCycleLabel = (cycle?: string) => {
  switch (cycle) {
    case "quarter": return "季";
    case "half_year": return "半年";
    case "year": return "年";
    case "two_year": return "2年";
    case "three_year": return "3年";
    case "one_time": return "一次性";
    default: return "月";
  }
};

