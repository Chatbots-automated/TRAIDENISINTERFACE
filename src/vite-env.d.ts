/// <reference types="vite/client" />

interface VoiceflowChat {
  load: (config: {
    verify: { projectID: string };
    url: string;
    versionID: string;
    render: {
      mode: string;
      target: HTMLElement | null;
    };
    autostart: boolean;
    voiceURL: string;
  }) => void;
  destroy?: () => void;
}

interface Window {
  voiceflow?: {
    chat: VoiceflowChat;
  };
}
