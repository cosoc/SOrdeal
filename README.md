# MQTT WebSocket 压力测试工具

一个基于 Tauri 的 MQTT WebSocket 连接压力测试工具，支持多种连接类型和**持续压测**场景。

# 手动构建
1. 首先必须有rust环境和yarn工具或者npm
2. 克隆代码到本地直接，分别执行如下命令
```shel
yarn install
yarn tauri build
```
执行文件在: src-tauri/target/release/bundle 下


## 主要特性

### 🚀 持续压测

- **持续运行**: 压测启动后会持续运行，直到手动停止
- **自动消息发送**: 每个连接每5秒自动发送一次测试消息
- **实时统计**: 实时显示连接状态、消息发送/接收数量
- **多压测管理**: 支持同时运行多个独立的压测场景

### 🔌 多种连接类型

- **普通连接**: 稳定的MQTT连接
- **频繁断开**: 模拟网络不稳定的连接，可配置断开概率
- **快速重连**: 模拟客户端快速重连场景
- **ID冲突**: 模拟客户端ID冲突的情况

### 📊 丰富的统计信息

- 连接状态实时监控
- 消息发送/接收统计
- 按连接组分类统计
- 连接活跃度进度条显示

### 🎛️ 灵活的配置

- 支持多个MQTT服务器配置
- 可选的用户名/密码认证
- 可配置的连接参数（keepalive、clean session等）
- 每个连接组可独立配置连接类型和参数

## ## 使用指南

### 1. 创建压测

1. 点击"创建新压测"按钮
2. 填写测试名称和MQTT服务器信息
3. 添加连接组，配置连接类型和数量
4. 点击"创建压测"完成创建

### 2. 配置连接组

每个连接组支持以下配置：

- **组名称**: 用于标识连接组
- **连接类型**: 选择连接行为模式
- **连接数量**: 该组要创建的连接数
- **断开概率**: 频繁断开类型的断开概率（0-1）
- **重连间隔**: 重连间隔时间（秒）

### 3. 启动压测

1. 在压测列表中选择要启动的压测
2. 点击"启动"按钮
3. **压测将开始创建连接并持续发送消息**
4. 可随时点击"停止"按钮终止压测

### 4. 监控统计

- 实时查看连接状态和消息统计
- 按连接组查看详细统计信息
- 监控连接活跃度和错误信息

## 连接类型详解

### 普通连接 (normal)

- 稳定的MQTT连接
- 适合测试服务器基础性能
- **每5秒发送一次测试消息**

### 频繁断开 (frequent_disconnect)

- 模拟网络不稳定的场景
- 可配置断开概率（0-1）
- 断开后按配置间隔自动重连
- 适合测试服务器重连处理能力

### 快速重连 (fast_reconnect)

- 模拟客户端快速重连
- 连接断开后立即重连
- 适合测试服务器连接管理能力

### ID冲突 (id_conflict)

- 使用相同的客户端ID
- 模拟客户端冲突场景
- 适合测试服务器冲突处理机制

## 配置建议

### 服务器配置

- **地址**: 通常为 `localhost` 或服务器IP
- **端口**: WebSocket端口，通常为 `9001`
- **用户名/密码**: 如果服务器需要认证则填写

### 连接参数

- **Clean Session**: 建议开启，确保每次连接都是干净的
- **Keepalive**: 建议60秒，可根据网络环境调整
- **重连间隔**: 建议1-5秒，避免过于频繁的重连

### 压测规模

- **小规模测试**: 10-50个连接
- **中等规模**: 100-500个连接
- **大规模测试**: 1000+个连接（注意服务器性能）

## 测试场景示例

### 场景1: 基础性能测试

```
压测名称: 基础性能测试
服务器: localhost:9001
连接组1: 普通连接 x 100
```

### 场景2: 网络不稳定测试

```
压测名称: 网络不稳定测试
服务器: localhost:9001
连接组1: 频繁断开 x 50 (断开概率: 0.3, 重连间隔: 3秒)
连接组2: 快速重连 x 30 (重连间隔: 1秒)
```

### 场景3: 客户端冲突测试

```
压测名称: 客户端冲突测试
服务器: localhost:9001
连接组1: ID冲突 x 20 (使用相同客户端ID)
连接组2: 普通连接 x 30
```

## 技术架构

### 前端

- **React 18**: 用户界面框架
- **Ant Design**: UI组件库
- **TypeScript**: 类型安全

### 后端

- **Tauri**: 桌面应用框架
- **Rust**: 系统级编程语言

### MQTT客户端

- **mqtt.js**: JavaScript MQTT客户端库
- **WebSocket**: 传输协议

## 注意事项

1. **服务器性能**: 大量连接可能对MQTT服务器造成压力，请确保服务器配置足够
2. **网络带宽**: 持续的消息发送会消耗网络带宽
3. **内存使用**: 大量连接会占用较多内存，建议分批测试
4. **错误处理**: 注意监控连接错误，及时调整配置

## 故障排除

### 连接失败

- 检查MQTT服务器是否正常运行
- 确认服务器地址和端口正确
- 检查防火墙设置

### 消息发送失败

- 检查连接状态
- 确认服务器支持WebSocket连接
- 查看错误日志

### 性能问题

- 减少连接数量
- 增加重连间隔
- 检查服务器资源使用情况

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v0.2.0

- 支持多个压测场景
- 添加多种连接类型（普通、频繁断开、ID冲突、快速重连）
- 连接组管理功能
- 改进的用户界面和监控

### v0.1.0

- 初始版本发布
- 基础 MQTT 连接测试功能
- 实时监控和统计
