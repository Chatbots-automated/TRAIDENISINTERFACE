/// <reference types="vite/client" />

// Voiceflow Widget Type Definitions
interface VoiceflowConfig {
  verify: {
    projectID: string;
  };
  url: string;
  versionID: string;
  voice?: {
    url: string;
  };
  render: {
    mode: 'embedded' | 'overlay';
    target: HTMLElement;
  };
  autostart?: boolean;
  css?: string; // Custom CSS injection (can use base64 data URL)
  assistant?: {
    title?: string;
    description?: string;
    image?: string;
    stylesheet?: string;
    header?: {
      visible?: boolean;
      avatar?: { visible?: boolean };
      title?: { visible?: boolean };
    };
    input?: {
      enabled?: boolean;
      placeholder?: string;
    };
  };
  theme?: {
    colors?: {
      background?: string;
      primary?: string;
      secondary?: string;
      text?: string;
    };
  };
}

interface VoiceflowChat {
  load: (config: VoiceflowConfig) => void;
  destroy?: () => void;
  on?: (event: string, callback: () => void) => void;
}

interface Window {
  voiceflow?: {
    chat: VoiceflowChat;
  };
}
