const FEEDBACK_EVENT = "droneops:feedback";

export const showFeedback = (feedback) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT, { detail: feedback }));
};

export const clearFeedback = (id) => {
  showFeedback({ id, clear: true });
};

export const feedbackEvents = {
  name: FEEDBACK_EVENT
};
