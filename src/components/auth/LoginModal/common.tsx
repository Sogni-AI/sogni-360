import React, { ReactNode } from 'react';
import './styles.css';
import { useModalCtx } from './context';

interface Props {
  children: ReactNode;
}

export function ContentPanel({ children }: Props) {
  return <div className="login-modal-content-panel">{children}</div>;
}

interface FormPanelProps extends Props {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  disabled?: boolean;
  autoComplete?: string;
  noValidate?: boolean;
}

export function FormPanel({ children, onSubmit, disabled, autoComplete, noValidate }: FormPanelProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="login-modal-content-panel"
      autoComplete={autoComplete}
      noValidate={noValidate}
    >
      <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0 }}>
        {children}
      </fieldset>
    </form>
  );
}

interface FormContentProps extends Props {
  noHeading?: boolean;
  subHeading?: ReactNode;
}

export function FormContent({ children, noHeading, subHeading }: FormContentProps) {
  const { text } = useModalCtx();
  return (
    <div className="login-modal-form-content">
      <div className="login-modal-content-header">
        <div className="login-modal-title-wrap">
          <img
            className="login-modal-logo"
            src="/van-icon.png"
            alt="Sogni 360"
          />
          {!noHeading && <h1 className="login-modal-title">{text.heading}</h1>}
        </div>
        {subHeading && <h2 className="login-modal-subtitle">{subHeading}</h2>}
      </div>
      {children}
    </div>
  );
}

export function FieldContainer({ children }: Props) {
  return <div className="login-modal-field-container">{children}</div>;
}

export function FormFooter({ children }: Props) {
  return <div className="login-modal-form-footer">{children}</div>;
}

export function ErrorMessage({ children }: Props) {
  return <div className="login-modal-error">{children}</div>;
}

interface LinkButtonProps extends Props {
  onClick: () => void;
}

export function LinkButton({ children, onClick }: LinkButtonProps) {
  return (
    <button className="login-modal-link-button" onClick={onClick} type="button">
      {children}
    </button>
  );
}
