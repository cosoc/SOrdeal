import mqtt, { IClientOptions } from 'mqtt';
import { StressTest, ConnectionGroup, MqttConnection, TestStats } from './types';

export class StressTestManager {
  private tests: Map<string, StressTest> = new Map();
  private connections: Map<string, MqttConnection> = new Map();
  private stats: Map<string, TestStats> = new Map();
  private timers: Map<string, { disconnectTimer?: number; reconnectTimer?: number; messageTimer?: number }> = new Map();
  private messageIntervals: Map<string, number> = new Map();

  constructor() {}

  // 创建新的压测
  createTest(test: Omit<StressTest, 'id' | 'isRunning' | 'createdAt'>): string {
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTest: StressTest = {
      ...test,
      id: testId,
      isRunning: false,
      createdAt: new Date()
    };
    
    this.tests.set(testId, newTest);
    this.stats.set(testId, {
      testId,
      totalConnections: 0,
      activeConnections: 0,
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      startTime: null,
      groups: {}
    });
    
    return testId;
  }

  // 获取所有压测
  getTests(): StressTest[] {
    return Array.from(this.tests.values());
  }

  // 获取单个压测
  getTest(testId: string): StressTest | undefined {
    return this.tests.get(testId);
  }

  // 删除压测
  deleteTest(testId: string): void {
    this.stopTest(testId);
    this.tests.delete(testId);
    this.stats.delete(testId);
    
    // 删除相关连接
    const connectionsToDelete = Array.from(this.connections.values())
      .filter(conn => conn.testId === testId);
    
    connectionsToDelete.forEach(conn => {
      this.disconnectConnection(conn.clientId);
    });
  }

  // 启动压测
  async startTest(testId: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);

    test.isRunning = true;
    this.tests.set(testId, test);

    const stats = this.stats.get(testId);
    if (stats) {
      stats.startTime = new Date();
      this.stats.set(testId, stats);
    }

    // 为每个连接组创建连接
    for (const group of test.connectionGroups) {
      await this.createConnectionsForGroup(testId, group);
    }

    // 启动消息发送定时器
    this.startMessageSending(testId);
  }

  // 停止压测
  stopTest(testId: string): void {
    const test = this.tests.get(testId);
    if (!test) return;

    test.isRunning = false;
    this.tests.set(testId, test);

    // 停止消息发送
    this.stopMessageSending(testId);

    // 断开所有相关连接
    const connectionsToDisconnect = Array.from(this.connections.values())
      .filter(conn => conn.testId === testId);
    
    connectionsToDisconnect.forEach(conn => {
      this.disconnectConnection(conn.clientId);
    });

    // 清理定时器
    this.timers.forEach((timers) => {
      if (timers.disconnectTimer) {
        clearTimeout(timers.disconnectTimer);
      }
      if (timers.reconnectTimer) {
        clearTimeout(timers.reconnectTimer);
      }
      if (timers.messageTimer) {
        clearTimeout(timers.messageTimer);
      }
    });
  }

  // 启动消息发送
  private startMessageSending(testId: string): void {
    const test = this.tests.get(testId);
    if (!test) return;

    // 每5秒发送一次消息
    const messageInterval = setInterval(() => {
      if (!test.isRunning) {
        clearInterval(messageInterval);
        return;
      }

      const testConnections = this.getConnections(testId);
      const connectedConnections = testConnections.filter(conn => conn.status === 'connected');

      // 为每个已连接的客户端发送消息
      connectedConnections.forEach(connection => {
        this.sendMessage(connection.clientId, {
          topic: `test/${testId}/message`,
          message: JSON.stringify({
            clientId: connection.clientId,
            timestamp: Date.now(),
            testId: testId,
            groupId: connection.groupId,
            messageId: Math.random().toString(36).substr(2, 9)
          })
        });
      });
    }, 5000);

    this.messageIntervals.set(testId, messageInterval);
  }

  // 停止消息发送
  private stopMessageSending(testId: string): void {
    const interval = this.messageIntervals.get(testId);
    if (interval) {
      clearInterval(interval);
      this.messageIntervals.delete(testId);
    }
  }

  // 发送消息
  private sendMessage(clientId: string, data: { topic: string; message: string }): void {
    const connection = this.connections.get(clientId);
    if (connection?.client && connection.status === 'connected') {
      try {
        connection.client.publish(data.topic, data.message);
        connection.messagesSent++;
        connection.lastActivity = new Date();
        this.connections.set(clientId, connection);
      } catch (error) {
        console.error(`Failed to send message from ${clientId}:`, error);
      }
    }
  }

  // 为连接组创建连接
  private async createConnectionsForGroup(testId: string, group: ConnectionGroup): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) return;

    for (let i = 0; i < group.count; i++) {
      const clientId = this.generateClientId(testId, group.id, i);
      await this.createConnection(testId, group, clientId);
      
      // 错开连接时间，避免同时大量连接
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 创建单个连接
  private async createConnection(testId: string, group: ConnectionGroup, clientId: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) return;

    const connection: MqttConnection = {
      id: clientId,
      clientId,
      groupId: group.id,
      testId,
      status: 'connecting',
      messagesSent: 0,
      messagesReceived: 0,
      lastActivity: new Date()
    };

    this.connections.set(clientId, connection);

    try {
      const options: IClientOptions = {
        clientId: group.type === 'id_conflict' && group.conflictClientIds?.length 
          ? group.conflictClientIds[Math.floor(Math.random() * group.conflictClientIds.length)]
          : clientId,
        clean: test.clean,
        keepalive: test.keepalive,
        reconnectPeriod: group.type === 'fast_reconnect' && group.reconnectInterval
          ? group.reconnectInterval * 1000
          : test.reconnectPeriod,
        connectTimeout: test.connectTimeout,
        username: test.username,
        password: test.password,
      };

      const url = `ws://${test.brokerUrl}:${test.port}/mqtt`;
      const client = mqtt.connect(url, options);

      client.on('connect', () => {
        const conn = this.connections.get(clientId);
        if (conn) {
          conn.status = 'connected';
          conn.lastActivity = new Date();
          this.connections.set(clientId, conn);
          
          // 订阅测试主题
          client.subscribe(`test/${testId}/#`);
          
          // 根据连接类型设置特殊行为
          this.setupConnectionBehavior(clientId, group);
        }
      });

      client.on('message', (topic: string, message: Buffer) => {
        const conn = this.connections.get(clientId);
        if (conn) {
          conn.messagesReceived++;
          conn.lastActivity = new Date();
          this.connections.set(clientId, conn);
        }
      });

      client.on('error', (error: any) => {
        const conn = this.connections.get(clientId);
        if (conn) {
          conn.status = 'error';
          conn.error = error.message;
          conn.lastActivity = new Date();
          this.connections.set(clientId, conn);
        }
      });

      client.on('close', () => {
        const conn = this.connections.get(clientId);
        if (conn) {
          conn.status = 'disconnected';
          conn.lastActivity = new Date();
          this.connections.set(clientId, conn);
        }
      });

      connection.client = client;
      this.connections.set(clientId, connection);

    } catch (error) {
      connection.status = 'error';
      connection.error = error instanceof Error ? error.message : 'Unknown error';
      this.connections.set(clientId, connection);
    }
  }

  // 设置连接的特殊行为
  private setupConnectionBehavior(clientId: string, group: ConnectionGroup): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    switch (group.type) {
      case 'frequent_disconnect':
        this.setupFrequentDisconnect(clientId, group);
        break;
      case 'fast_reconnect':
        this.setupFastReconnect(clientId, group);
        break;
      case 'id_conflict':
        // ID冲突在创建连接时已经处理
        break;
      default:
        // 普通连接，无需特殊处理
        break;
    }
  }

  // 设置频繁断开连接
  private setupFrequentDisconnect(clientId: string, group: ConnectionGroup): void {
    if (!group.disconnectProbability) return;

    const scheduleDisconnect = () => {
      const connection = this.connections.get(clientId);
      if (!connection) return;
      
      const test = this.tests.get(connection.testId);
      if (!test?.isRunning) return;

      const shouldDisconnect = Math.random() < group.disconnectProbability!;
      if (shouldDisconnect) {
        this.disconnectConnection(clientId);
        
        // 设置重连
        const reconnectDelay = group.reconnectInterval ? group.reconnectInterval * 1000 : 5000;
        const reconnectTimer = setTimeout(() => {
          this.reconnectConnection(clientId);
        }, reconnectDelay);
        
        this.timers.set(clientId, { reconnectTimer });
      } else {
        // 继续调度下一次断开检查
        const nextCheckDelay = Math.random() * 10000 + 5000; // 5-15秒
        const disconnectTimer = setTimeout(scheduleDisconnect, nextCheckDelay);
        this.timers.set(clientId, { disconnectTimer });
      }
    };

    const connection = this.connections.get(clientId);
    if (connection) {
      const initialDelay = Math.random() * 10000 + 5000; // 5-15秒后开始
      const disconnectTimer = setTimeout(scheduleDisconnect, initialDelay);
      this.timers.set(clientId, { disconnectTimer });
    }
  }

  // 设置快速重连
  private setupFastReconnect(clientId: string, group: ConnectionGroup): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    // 监听断开事件，立即重连
    if (connection.client) {
      connection.client.on('close', () => {
        const test = this.tests.get(connection.testId);
        if (!test?.isRunning) return;

        const reconnectDelay = group.reconnectInterval ? group.reconnectInterval * 1000 : 1000;
        const reconnectTimer = setTimeout(() => {
          this.reconnectConnection(clientId);
        }, reconnectDelay);
        
        this.timers.set(clientId, { reconnectTimer });
      });
    }
  }

  // 断开连接
  disconnectConnection(clientId: string): void {
    const connection = this.connections.get(clientId);
    if (connection?.client) {
      connection.client.end();
      connection.status = 'disconnected';
      connection.lastActivity = new Date();
      this.connections.set(clientId, connection);
    }
  }

  // 重连
  private async reconnectConnection(clientId: string): Promise<void> {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    const test = this.tests.get(connection.testId);
    const group = test?.connectionGroups.find(g => g.id === connection.groupId);
    
    if (test && group) {
      await this.createConnection(connection.testId, group, clientId);
    }
  }

  // 生成客户端ID
  private generateClientId(testId: string, groupId: string, index: number): string {
    return `${testId}_${groupId}_${index}_${Date.now()}`;
  }

  // 获取连接
  getConnections(testId?: string): MqttConnection[] {
    const connections = Array.from(this.connections.values());
    return testId ? connections.filter(conn => conn.testId === testId) : connections;
  }

  // 获取统计信息
  getStats(testId?: string): TestStats[] {
    const stats = Array.from(this.stats.values());
    return testId ? stats.filter(stat => stat.testId === testId) : stats;
  }

  // 更新统计信息
  updateStats(): void {
    this.stats.forEach((stat, testId) => {
      const testConnections = this.getConnections(testId);
      
      stat.totalConnections = testConnections.length;
      stat.activeConnections = testConnections.filter(c => c.status === 'connected').length;
      stat.totalMessagesSent = testConnections.reduce((sum: number, c: MqttConnection) => sum + c.messagesSent, 0);
      stat.totalMessagesReceived = testConnections.reduce((sum: number, c: MqttConnection) => sum + c.messagesReceived, 0);
      
      // 按组统计
      stat.groups = {};
      testConnections.forEach(conn => {
        if (!stat.groups[conn.groupId]) {
          stat.groups[conn.groupId] = {
            total: 0,
            active: 0,
            messagesSent: 0,
            messagesReceived: 0
          };
        }
        
        stat.groups[conn.groupId].total++;
        if (conn.status === 'connected') {
          stat.groups[conn.groupId].active++;
        }
        stat.groups[conn.groupId].messagesSent += conn.messagesSent;
        stat.groups[conn.groupId].messagesReceived += conn.messagesReceived;
      });
      
      this.stats.set(testId, stat);
    });
  }

  // 清理资源
  cleanup(): void {
    this.tests.forEach((_, testId) => {
      this.stopTest(testId);
    });
    
    this.timers.forEach((timers) => {
      if (timers.disconnectTimer) {
        clearTimeout(timers.disconnectTimer);
      }
      if (timers.reconnectTimer) {
        clearTimeout(timers.reconnectTimer);
      }
      if (timers.messageTimer) {
        clearTimeout(timers.messageTimer);
      }
    });

    this.messageIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    
    this.tests.clear();
    this.connections.clear();
    this.stats.clear();
    this.timers.clear();
    this.messageIntervals.clear();
  }
} 