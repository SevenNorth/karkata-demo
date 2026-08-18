# Karkata Demo：一屏小农场

## 场景

固定镜头的 14 x 9 格小农场，角色、农田、商店、出货箱和农舍房间同时可见，不滚动地图。农舍房间划分为床和仓库，商店支持购买种子和售卖作物。用户通过右侧对话框发出自然语言指令，浏览器中的 Karkata Agent 选择农场工具，工具调用本地 `FarmSimulation` 完成状态变更，Phaser 只负责渲染和动画。

## 第一版循环

- 第 1 天 06:00 开始，100 体力、100 金币和 3 包防风草种子。
- 耕地、种植、浇水、收获、购买、售卖和睡觉均为显式工具。
- 睡觉推进一天、恢复体力并推进作物成长。
- 所有动作都由模拟层校验位置、体力、库存、金币和作物状态。

## 工具

`get_farm_state`、`move_to`、`till_soil`、`plant_seed`、`water_crop`、`harvest_crop`、`buy_seeds`、`sell_items`、`store_items`、`withdraw_items`、`sleep`。

工具不接受 DOM 坐标、不执行网络请求、不修改 Cookie/Storage，也不访问服务器敏感数据。工具结果只返回游戏状态和脱敏的动作消息。完整循环为：耕地、种植、浇水、睡觉推进成长、收获，再售卖。

## 架构边界

- `FarmSimulation`：可序列化的游戏状态和规则。
- `farmTools.ts`：Zod 输入校验和 Agent 工具适配。
- `FarmCanvas.tsx`：固定相机 Phaser 场景，状态变化后重绘。
- React DOM：对话框、HUD、额度和登录状态。

后续增加动画、素材裁切或存档时，不能把游戏规则迁移到 Phaser `update()` 或 React 组件中。
