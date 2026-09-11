import { Bot, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { droneOpsApi } from "../../services/droneOpsApi";

const AiAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Ask me about drones, missions, locations, or mission planning."
    }
  ]);
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const requestHistory = useMemo(() => (
    messages
      .filter((message) => ["user", "assistant"].includes(message.role))
      .slice(-10)
      .map(({ role, content }) => ({ role, content }))
  ), [messages]);

  const sendMessage = async (event) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setError("");
    setPendingAction(null);
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    await requestAssistant({ message: trimmed, history: requestHistory });
  };

  const requestAssistant = async (payload) => {
    setIsLoading(true);
    try {
      const result = await droneOpsApi.ai.chat(payload);
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
      setPendingAction(result.pendingAction ?? null);
    } catch (requestError) {
      const code = requestError.code ? ` (${requestError.code})` : "";
      setError(`${requestError.message ?? "AI assistant could not respond."}${code}`);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmAction = async () => {
    if (!pendingAction || isLoading) return;
    setError("");
    setMessages((current) => [...current, { role: "user", content: "Confirm action" }]);
    const action = pendingAction;
    setPendingAction(null);
    await requestAssistant({
      message: "Confirmed",
      history: requestHistory,
      confirmation: {
        toolName: action.toolName,
        arguments: action.arguments
      }
    });
  };

  return (
    <div className={`ai-assistant ${isOpen ? "open" : ""}`}>
      {isOpen && (
        <section className="ai-assistant-panel" aria-label="DroneOps AI assistant">
          <header className="ai-assistant-header">
            <div>
              <span>AI Assistant</span>
              <small>Uses your DroneOps permissions</small>
            </div>
            <button className="icon-button compact" type="button" aria-label="Close AI assistant" onClick={() => setIsOpen(false)}>
              <X size={16} />
            </button>
          </header>

          <div className="ai-assistant-messages">
            {messages.map((message, index) => (
              <article className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
                <p>{message.content}</p>
              </article>
            ))}
            {isLoading && (
              <article className="ai-message assistant loading">
                <Loader2 size={15} />
                <p>Working on your request...</p>
              </article>
            )}
            {error && <p className="ai-assistant-error">{error}</p>}
          </div>

          {pendingAction && (
            <div className="ai-confirmation">
              <strong>Confirmation needed</strong>
              <p>The assistant prepared an action. Confirm only if the details are correct.</p>
              <div>
                <button className="secondary-button" type="button" onClick={() => setPendingAction(null)} disabled={isLoading}>Cancel</button>
                <button className="primary-button" type="button" onClick={confirmAction} disabled={isLoading}>
                  <CheckCircle2 size={16} />
                  Confirm
                </button>
              </div>
            </div>
          )}

          <form className="ai-assistant-input" onSubmit={sendMessage}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask DroneOps..."
              disabled={isLoading}
            />
            <button className="primary-button" type="submit" disabled={isLoading || !input.trim()} aria-label="Send AI message">
              <Send size={16} />
            </button>
          </form>
        </section>
      )}

      <button className="ai-assistant-toggle" type="button" aria-label="Open AI assistant" onClick={() => setIsOpen((current) => !current)}>
        <Bot size={22} />
      </button>
    </div>
  );
};

export default AiAssistant;
