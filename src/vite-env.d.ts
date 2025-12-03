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
  assistant?: {
    title?: string;
    description?: string;
    image?: string;
    stylesheet?: string;
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
