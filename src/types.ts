export type ConnectionType = 'normal' | 'frequent_disconnect' | 'id_conflict' | 'fast_reconnect';

export interface ConnectionGroup {
  id: string;
  name: string;
  count: number;
  type: ConnectionType;
  reconnectInterval?: number; // 重连间隔（秒）
  disconnectProbability?: number; // 断开概率（0-1）
  conflictClientIds?: string[]; // 冲突的客户端ID列表
}

export interface StressTest {
  id: string;
  name: string;
  brokerUrl: string;
  port: number;
  username?: string;
  password?: string;
  keepalive: number;
  clean: boolean;
  reconnectPeriod: number;
  connectTimeout: number;
  connectionGroups: ConnectionGroup[];
  isRunning: boolean;
  createdAt: Date;
}

export interface MqttConnection {
  id: string;
  clientId: string;
  groupId: string;
  testId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  messagesSent: number;
  messagesReceived: number;
  lastActivity: Date;
  error?: string;
  client?: any;
  disconnectTimer?: number;
  reconnectTimer?: number;
}

export interface TestStats {
  testId: string;
  totalConnections: number;
  activeConnections: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  startTime: Date | null;
  groups: {
    [groupId: string]: {
      total: number;
      active: number;
      messagesSent: number;
      messagesReceived: number;
    };
  };
} 