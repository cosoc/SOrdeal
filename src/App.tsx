import React, { useState, useEffect, useRef } from 'react';
import { Button, Card, Input, Select, Switch, Space, Table, Tag, Progress, Row, Col, Typography, Divider, Alert, Statistic } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { StressTestManager } from './StressTestManager';
import { StressTest, ConnectionGroup, ConnectionType, MqttConnection, TestStats } from './types';

const { Title, Text } = Typography;
const { Option } = Select;

const stressTestManager = new StressTestManager();

function App() {
  const [tests, setTests] = useState<StressTest[]>([]);
  const [connections, setConnections] = useState<MqttConnection[]>([]);
  const [stats, setStats] = useState<TestStats[]>([]);
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [newTest, setNewTest] = useState<Partial<StressTest>>({
    name: '',
    brokerUrl: 'localhost',
    port: 9001,
    username: '',
    password: '',
    clean: true,
    keepalive: 60,
    reconnectPeriod: 1000,
    connectTimeout: 30000,
    connectionGroups: []
  });
  const [newGroup, setNewGroup] = useState<Partial<ConnectionGroup>>({
    name: '',
    type: 'normal',
    count: 10,
    disconnectProbability: 0.1,
    reconnectInterval: 5,
    conflictClientIds: ['conflict_client_1', 'conflict_client_2']
  });

  const statsUpdateInterval = useRef<number | null>(null);

  useEffect(() => {
    // 启动实时统计更新
    statsUpdateInterval.current = window.setInterval(() => {
      stressTestManager.updateStats();
      setStats(stressTestManager.getStats());
      setConnections(stressTestManager.getConnections());
    }, 1000);

    return () => {
      if (statsUpdateInterval.current) {
        clearInterval(statsUpdateInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    setTests(stressTestManager.getTests());
  }, []);

  const createTest = () => {
    if (!newTest.name || !newTest.brokerUrl || newTest.connectionGroups?.length === 0) {
      alert('请填写测试名称、服务器地址并至少添加一个连接组');
      return;
    }

    const testId = stressTestManager.createTest(newTest as Omit<StressTest, 'id' | 'isRunning' | 'createdAt'>);
    setTests(stressTestManager.getTests());
    setSelectedTest(testId);
    setIsCreatingTest(false);
    setNewTest({
      name: '',
      brokerUrl: 'localhost',
      port: 9001,
      username: '',
      password: '',
      clean: true,
      keepalive: 60,
      reconnectPeriod: 1000,
      connectTimeout: 30000,
      connectionGroups: []
    });
  };

  const addGroup = () => {
    if (!newGroup.name || !newGroup.count) {
      alert('请填写组名称和连接数量');
      return;
    }

    const group: ConnectionGroup = {
      id: `group_${Date.now()}`,
      name: newGroup.name!,
      type: newGroup.type!,
      count: newGroup.count!,
      disconnectProbability: newGroup.disconnectProbability,
      reconnectInterval: newGroup.reconnectInterval,
      conflictClientIds: newGroup.conflictClientIds
    };

    setNewTest((prev: Partial<StressTest>) => ({
      ...prev,
      connectionGroups: [...(prev.connectionGroups || []), group]
    }));

    setNewGroup({
      name: '',
      type: 'normal',
      count: 10,
      disconnectProbability: 0.1,
      reconnectInterval: 5,
      conflictClientIds: ['conflict_client_1', 'conflict_client_2']
    });
  };

  const removeGroup = (index: number) => {
    setNewTest((prev: Partial<StressTest>) => ({
      ...prev,
      connectionGroups: prev.connectionGroups?.filter((_: ConnectionGroup, i: number) => i !== index)
    }));
  };

  const startTest = async (testId: string) => {
    try {
      await stressTestManager.startTest(testId);
      setTests(stressTestManager.getTests());
    } catch (error) {
      console.error('启动测试失败:', error);
      alert('启动测试失败: ' + (error as Error).message);
    }
  };

  const stopTest = (testId: string) => {
    stressTestManager.stopTest(testId);
    setTests(stressTestManager.getTests());
  };

  const deleteTest = (testId: string) => {
    stressTestManager.deleteTest(testId);
    setTests(stressTestManager.getTests());
    if (selectedTest === testId) {
      setSelectedTest(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'green';
      case 'connecting': return 'blue';
      case 'disconnected': return 'orange';
      case 'error': return 'red';
      default: return 'default';
    }
  };

  const getTypeColor = (type: ConnectionType) => {
    switch (type) {
      case 'normal': return 'blue';
      case 'frequent_disconnect': return 'orange';
      case 'fast_reconnect': return 'green';
      case 'id_conflict': return 'red';
      default: return 'default';
    }
  };

  const selectedTestData = tests.find((t: StressTest) => t.id === selectedTest);
  const selectedTestStats = stats.find((s: TestStats) => s.testId === selectedTest);
  const selectedTestConnections = connections.filter((c: MqttConnection) => c.testId === selectedTest);

  // 获取当前测试的所有组名称
  const getGroupName = (groupId: string) => {
    if (!selectedTestData) return groupId;
    const group = selectedTestData.connectionGroups.find((g: ConnectionGroup) => g.id === groupId);
    return group ? group.name : groupId;
  };

  // 根据筛选条件过滤连接
  const filteredConnections = selectedTestConnections.filter((conn: MqttConnection) => {
    if (groupFilter === 'all') return true;
    return conn.groupId === groupFilter;
  });

  // 获取可筛选的组选项
  const groupOptions = selectedTestData ? selectedTestData.connectionGroups.map((group: ConnectionGroup) => ({
    value: group.id,
    label: group.name
  })) : [];

  const connectionColumns = [
    {
      title: '客户端ID',
      dataIndex: 'clientId',
      key: 'clientId',
      width: 200,
      render: (text: string) => <Text code>{text}</Text>
    },
    {
      title: '组',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 120,
      render: (groupId: string) => getGroupName(groupId)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <Tag color={getStatusColor(status)}>{status}</Tag>
    },
    {
      title: '发送消息',
      dataIndex: 'messagesSent',
      key: 'messagesSent',
      width: 100
    },
    {
      title: '接收消息',
      dataIndex: 'messagesReceived',
      key: 'messagesReceived',
      width: 100
    },
    {
      title: '最后活动',
      dataIndex: 'lastActivity',
      key: 'lastActivity',
      width: 150,
      render: (date: Date) => date.toLocaleTimeString()
    },
    {
      title: '错误',
      dataIndex: 'error',
      key: 'error',
      render: (error: string) => error ? <Text type="danger">{error}</Text> : '-'
    }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <Title level={2}>MQTT WebSocket 压力测试工具</Title>
      
      <Alert
        message="压测说明"
        description="压测启动后会持续运行，每个连接每5秒发送一次消息，直到手动停止。支持多种连接类型：普通连接、频繁断开、快速重连、ID冲突等。"
        type="info"
        showIcon
        style={{ marginBottom: '20px' }}
      />

      {/* 创建新测试 */}
      <Card title="创建新压测" style={{ marginBottom: '20px' }}>
        {!isCreatingTest ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreatingTest(true)}>
            创建新压测
          </Button>
        ) : (
          <div>
            <Row gutter={16}>
              <Col span={8}>
                <Input
                  placeholder="测试名称"
                  value={newTest.name}
                  onChange={(e) => setNewTest(prev => ({ ...prev, name: e.target.value }))}
                  style={{ marginBottom: '10px' }}
                />
              </Col>
              <Col span={8}>
                <Input
                  placeholder="服务器地址"
                  value={newTest.brokerUrl}
                  onChange={(e) => setNewTest(prev => ({ ...prev, brokerUrl: e.target.value }))}
                  style={{ marginBottom: '10px' }}
                />
              </Col>
              <Col span={8}>
                <Input
                  placeholder="端口"
                  type="number"
                  value={newTest.port}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTest(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                  style={{ marginBottom: '10px' }}
                />
              </Col>
            </Row>
            
            <Row gutter={16}>
              <Col span={8}>
                <Input
                  placeholder="用户名（可选）"
                  value={newTest.username}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTest(prev => ({ ...prev, username: e.target.value }))}
                  style={{ marginBottom: '10px' }}
                />
              </Col>
              <Col span={8}>
                <Input.Password
                  placeholder="密码（可选）"
                  value={newTest.password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTest(prev => ({ ...prev, password: e.target.value }))}
                  style={{ marginBottom: '10px' }}
                />
              </Col>
              <Col span={8}>
                <Space>
                  <Switch
                    checked={newTest.clean}
                    onChange={(checked) => setNewTest(prev => ({ ...prev, clean: checked }))}
                  />
                  <Text>Clean Session</Text>
                </Space>
              </Col>
            </Row>

            <Divider>连接组配置</Divider>
            
            {/* 添加连接组 */}
            <Card size="small" title="添加连接组" style={{ marginBottom: '10px' }}>
              <Row gutter={16}>
                <Col span={6}>
                  <Input
                    placeholder="组名称"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                  />
                </Col>
                <Col span={4}>
                  <Select
                    value={newGroup.type}
                    onChange={(value) => setNewGroup(prev => ({ ...prev, type: value }))}
                    style={{ width: '100%' }}
                  >
                    <Option value="normal">普通连接</Option>
                    <Option value="frequent_disconnect">频繁断开</Option>
                    <Option value="fast_reconnect">快速重连</Option>
                    <Option value="id_conflict">ID冲突</Option>
                  </Select>
                </Col>
                <Col span={4}>
                  <Input
                    placeholder="连接数量"
                    type="number"
                    value={newGroup.count}
                    onChange={(e) => setNewGroup(prev => ({ ...prev, count: parseInt(e.target.value) }))}
                  />
                </Col>
                <Col span={4}>
                  <Input
                    placeholder="断开概率"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={newGroup.disconnectProbability}
                    onChange={(e) => setNewGroup(prev => ({ ...prev, disconnectProbability: parseFloat(e.target.value) }))}
                  />
                </Col>
                <Col span={4}>
                  <Input
                    placeholder="重连间隔(秒)"
                    type="number"
                    value={newGroup.reconnectInterval}
                    onChange={(e) => setNewGroup(prev => ({ ...prev, reconnectInterval: parseInt(e.target.value) }))}
                  />
                </Col>
                <Col span={2}>
                  <Button type="primary" onClick={addGroup}>添加</Button>
                </Col>
              </Row>
            </Card>

            {/* 已添加的连接组 */}
            {newTest.connectionGroups && newTest.connectionGroups.length > 0 && (
              <Card size="small" title="已添加的连接组">
                {newTest.connectionGroups.map((group, index) => (
                  <div key={group.id} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Space>
                          <Tag color={getTypeColor(group.type)}>{group.name}</Tag>
                          <Text>类型: {group.type}</Text>
                          <Text>数量: {group.count}</Text>
                          {group.disconnectProbability && <Text>断开概率: {group.disconnectProbability}</Text>}
                          {group.reconnectInterval && <Text>重连间隔: {group.reconnectInterval}s</Text>}
                        </Space>
                      </Col>
                      <Col>
                        <Button size="small" danger onClick={() => removeGroup(index)}>删除</Button>
                      </Col>
                    </Row>
                  </div>
                ))}
              </Card>
            )}

            <div style={{ marginTop: '20px' }}>
              <Space>
                <Button type="primary" onClick={createTest}>创建压测</Button>
                <Button onClick={() => setIsCreatingTest(false)}>取消</Button>
              </Space>
            </div>
          </div>
        )}
      </Card>

      {/* 压测列表 */}
      <Card title="压测列表" style={{ marginBottom: '20px' }}>
        <Row gutter={16}>
          {tests.map(test => {
            const testStats = stats.find(s => s.testId === test.id);
            return (
              <Col span={8} key={test.id}>
                <Card
                  size="small"
                  title={test.name}
                  extra={
                    <Space>
                      {test.isRunning ? (
                        <Button
                          size="small"
                          icon={<PauseCircleOutlined />}
                          onClick={() => stopTest(test.id)}
                        >
                          停止
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          onClick={() => startTest(test.id)}
                        >
                          启动
                        </Button>
                      )}
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => deleteTest(test.id)}
                      >
                        删除
                      </Button>
                    </Space>
                  }
                  style={{ 
                    marginBottom: '10px',
                    border: selectedTest === test.id ? '2px solid #1890ff' : undefined
                  }}
                  onClick={() => setSelectedTest(test.id)}
                >
                  <div>
                    <Text>服务器: {test.brokerUrl}:{test.port}</Text>
                    <br />
                    <Text>状态: </Text>
                    <Tag color={test.isRunning ? 'green' : 'default'}>
                      {test.isRunning ? '运行中' : '已停止'}
                    </Tag>
                    {testStats && (
                      <div style={{ marginTop: '10px' }}>
                        <Progress
                          percent={testStats.totalConnections > 0 ? (testStats.activeConnections / testStats.totalConnections) * 100 : 0}
                          size="small"
                          status={test.isRunning ? 'active' : 'normal'}
                        />
                        <Text type="secondary">
                          {testStats.activeConnections}/{testStats.totalConnections} 连接活跃
                        </Text>
                      </div>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>

      {/* 选中测试的详细信息 */}
      {selectedTestData && (
        <Card title={`压测详情: ${selectedTestData.name}`}>
          <Row gutter={16} style={{ marginBottom: '20px' }}>
            <Col span={6}>
              <Statistic
                title="总连接数"
                value={selectedTestStats?.totalConnections || 0}
                suffix="个"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="活跃连接"
                value={selectedTestStats?.activeConnections || 0}
                suffix="个"
                valueStyle={{ color: '#3f8600' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="发送消息"
                value={selectedTestStats?.totalMessagesSent || 0}
                suffix="条"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="接收消息"
                value={selectedTestStats?.totalMessagesReceived || 0}
                suffix="条"
              />
            </Col>
          </Row>

          {/* 连接组统计 */}
          {selectedTestStats && Object.keys(selectedTestStats.groups).length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <Title level={4}>连接组统计</Title>
              <Row gutter={16}>
                {Object.entries(selectedTestStats.groups).map(([groupId, groupStats]) => (
                  <Col span={6} key={groupId}>
                    <Card size="small">
                      <Statistic
                        title={groupId}
                        value={groupStats.active}
                        suffix={`/ ${groupStats.total}`}
                      />
                      <div style={{ marginTop: '10px' }}>
                        <Text type="secondary">
                          发送: {groupStats.messagesSent} | 接收: {groupStats.messagesReceived}
                        </Text>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}

          {/* 连接列表 */}
          <div>
            <Title level={4}>连接详情</Title>
            
            {/* 组筛选器 */}
            <div style={{ marginBottom: '16px' }}>
              <Space>
                <Text>筛选组:</Text>
                <Select
                  value={groupFilter}
                  onChange={setGroupFilter}
                  style={{ width: 200 }}
                  placeholder="选择要显示的组"
                >
                  <Option value="all">全部组</Option>
                  {groupOptions.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Select>
                <Text type="secondary">
                  显示 {filteredConnections.length} / {selectedTestConnections.length} 个连接
                </Text>
              </Space>
            </div>
            
            <Table
              dataSource={filteredConnections}
              columns={connectionColumns}
              rowKey="clientId"
              size="small"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

export default App; 