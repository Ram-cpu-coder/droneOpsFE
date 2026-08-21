import { useState } from "react";

const CopyableId = ({ value }) => {
  const [isCopied, setIsCopied] = useState(false);
  const idValue = value ? String(value) : "";

  const handleCopy = async (event) => {
    event.stopPropagation();
    if (!idValue) return;

    try {
      await navigator.clipboard.writeText(idValue);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1400);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <button
      className={`table-id-token ${isCopied ? "is-copied" : ""}`}
      type="button"
      onClick={handleCopy}
      title={isCopied ? "Copied" : `Copy ID: ${idValue}`}
    >
      {isCopied ? "Copied" : idValue}
    </button>
  );
};

export default CopyableId;
