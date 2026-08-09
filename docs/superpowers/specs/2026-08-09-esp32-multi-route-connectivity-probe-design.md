# ESP32 多线路连通性探针设计

更新：2026-08-09

## 目标

在宿舍空气站正式固件中增加一次性启动探针，分别判断当前网站、Supabase 和大阪服务器三条网络线路在哪一层成功或失败。探针只用于诊断，不改变正式上传地址，不发送来源令牌、Supabase 密钥或传感器数据。

## 探测目标

ESP32 连接已配置的 Wi-Fi 且完成 UTC 同步后，依次运行以下探测：

1. 当前网站 `shawn1300.cc.cd`
   - DNS 解析
   - TCP 443 连接
   - 使用现有受信根证书完成 TLS 握手
2. Supabase 项目域名
   - DNS 解析
   - TCP 443 连接
   - 使用现有受信根证书完成 TLS 握手
   - 不发送 Supabase API Key，也不访问 Data API
3. 大阪服务器 `217.142.225.118`
   - TCP 80 连接
   - 发送不含凭据和正文的 `HEAD /` 请求
   - 读取并验证 HTTP 状态行

大阪探针成功只表示国内网络能够连接该服务器的 HTTP 入口，不代表服务器已经具备可用于正式上传的 HTTPS 接口。

## 执行时机和控制流

探针在每次设备重启后只运行一次。设备必须同时满足以下条件才开始探测：

- Wi-Fi 已连接；
- UTC 时钟已同步。

三条线路依次执行。任意一条失败后继续下一条，不因单点失败中止整组诊断。全部探测完成后，固件继续现有传感器采样和每十分钟上传流程。Wi-Fi 中途断线并恢复时不重复运行探针。

每个 DNS、TCP、TLS 或 HTTP 阶段使用约 8 秒的有界超时，避免诊断无限等待。探针不修改现有 Wi-Fi 三次尝试与多网络切换策略。

## 日志格式

每条线路使用独立、可辨认的标题和阶段结果。例如：

```text
[1/3] Website HTTPS
DNS OK: 104.21.2.155
TCP 443 OK: 522 ms
TLS FAILED: -80, connection reset

[2/3] Supabase HTTPS
DNS OK: 1.2.3.4
TCP 443 OK: 410 ms
TLS OK: 780 ms

[3/3] Osaka HTTP
TCP 80 OK: 190 ms
HTTP OK: 200

Probe summary: Website=TLS_FAIL, Supabase=TLS_OK, Osaka=HTTP_OK
```

阶段结果含义固定如下：

- `DNS FAILED`：域名无法解析；
- `TCP FAILED`：目标端口或网络线路不可达；
- `TLS FAILED`：TCP 已建立，但 HTTPS 握手失败；
- `HTTP FAILED`：已连接大阪服务器，但没有收到合法 HTTP 状态行；
- `OK`：对应阶段成功。

汇总结果保留最具体的最终状态，使用户能直接比较三条线路，无需从完整日志推断。

## 代码边界

探针逻辑保留在 `firmware/dormitory-air-station/dormitory-air-station.ino`，但使用小型、职责单一的函数分隔：

- HTTPS 主机探针负责 DNS、TCP 和 TLS；
- 大阪 HTTP 探针负责 TCP、`HEAD /` 和状态行；
- 汇总函数只负责输出三个最终状态。

现有传感器读取、聚合、正文构造和正式上传函数不改协议。正式上传仍固定发送到：

```text
https://shawn1300.cc.cd/api/environment/v2/ingest
```

## 安全约束

- 不在源码或串口中输出 Wi-Fi 密码、来源令牌或 Authorization 请求头。
- 不把 Supabase publishable、legacy anon、secret 或 service-role key 写入 ESP32。
- Supabase 探针只执行 TLS 握手，不发送 HTTP API 请求。
- 大阪探针只访问公网 80 端口，不开放或访问 Home Assistant 的 8123 端口。
- TLS 必须校验证书，禁止调用 `setInsecure()`。
- 真实凭据继续只存在于被 Git 忽略的 `secrets.h` 和设备闪存。

## 验证

实施完成后执行以下检查：

1. 使用当前 Espressif ESP32 Arduino 平台编译正式固件，确认程序存储和动态内存未超限。
2. 搜索变更，确认没有新增密钥、令牌或 Wi-Fi 密码。
3. 刷入 COM4，重启后确认三条探针各运行一次并输出最终汇总。
4. 确认探针结束后 SHT30、PMS5003 样本数继续增长。
5. 等待一个十分钟窗口，确认正式上传行为与探针改动前一致。

## 后续决策

- 若 Supabase TLS 成功，单独设计一个不向设备暴露高权限密钥的 Supabase 接收入口。
- 若大阪 HTTP 成功，可继续为大阪服务器配置域名、受信任证书和带来源令牌校验的 HTTPS 中转接口。
- 若两条备用线路均失败，继续排查国内网络出口或 ESP32 TLS 客户端与目标边缘网络的兼容性。

这些后续工作不属于本次探针改动，必须分别设计和批准后实施。
