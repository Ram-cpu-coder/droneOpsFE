import LoadingLogo from "./LoadingLogo";

const ActionButton = ({
  children,
  icon: Icon,
  iconPosition = "start",
  isLoading = false,
  variant = "secondary",
  type = "button",
  onClick,
  ...buttonProps
}) => {
  return (
    <button
      className={`${variant}-button${isLoading ? " is-loading" : ""}`}
      type={type}
      onClick={onClick}
      aria-busy={isLoading}
      {...buttonProps}
    >
      {isLoading && iconPosition === "start" && <LoadingLogo label="Loading" size="btn" compact />}
      {!isLoading && Icon && iconPosition === "start" && <Icon size={17} />}
      {children}
      {isLoading && iconPosition === "end" && <LoadingLogo label="Loading" size="btn" compact />}
      {!isLoading && Icon && iconPosition === "end" && <Icon size={17} />}
    </button>
  );
};

export default ActionButton;
