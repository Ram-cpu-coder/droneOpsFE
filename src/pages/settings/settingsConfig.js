export const thresholdDefinitions = [
  {
    key: "minimumLandingBattery",
    label: "Minimum landing battery",
    unit: "%",
    fallback: 24,
    description: "Create a high-priority battery alert below this level."
  },
  {
    key: "maximumWindSpeed",
    label: "Maximum wind speed",
    unit: " km/h",
    fallback: 34,
    description: "Flag risky operations when reported wind exceeds this speed."
  },
  {
    key: "lowSignalWarning",
    label: "Low signal warning",
    unit: "%",
    fallback: 70,
    description: "Create a signal warning when link strength drops below this level."
  }
];

export const defaultThresholds = thresholdDefinitions.map((item) => ({ ...item, value: item.fallback }));

export const toThresholdRows = (payload = {}) => {
  return thresholdDefinitions.map((item) => ({
    ...item,
    value: Number.isFinite(Number(payload[item.key])) ? Number(payload[item.key]) : item.fallback
  }));
};

export const toThresholdPayload = (rows = []) => {
  return rows.reduce((payload, item) => ({
    ...payload,
    [item.key]: Number(item.value)
  }), {});
};

export const getEmailChangeToast = (emailChangePending) => {
  if (!emailChangePending) return null;

  if (!emailChangePending.emailSent) {
    return {
      type: "error",
      title: "Verification email not sent",
      message: "Your email change is pending, but the verification email could not be sent. Please check SMTP configuration before retrying."
    };
  }

  return {
    type: "success",
    title: "Verify current email",
    message: `We sent a confirmation link to ${emailChangePending.currentEmail}. Your email will change after that link is opened.`
  };
};
