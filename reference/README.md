# reference：已经验证过的内容和算法

这个文件夹只读。新项目的代码从零写，内容和算法以这里为准。

## 文件

| 文件 | 内容 |
|---|---|
| `bank_v2.1.json` | 题库 2.1 版。42 道题、93 个版本、11 种身份。题目文字、选项、分值、载荷的唯一来源 |
| `python/items2.py` | 参考引擎：选题、计时折减、评分、股价，以及走完所有情况的检查。运行 `python3 items2.py` 打印检查结果 |
| `python/items.py` | 第 1 版题库，`items2.py` 从里面取共用的题目文字。只为让 `items2.py` 能运行 |
| `test_page.html` | 单文件测试页，可以直接用浏览器打开。`<script>` 里的 `compute`、`flags`、`renderResult` 是结果页、一致性检查、反差、社会位置的参考实现 |
| `golden_vectors.json` | 335 组标准答案，由测试页算出，并与 `items2.py` 逐条核对一致 |
| `docs/` | 产品调研（中文、英文）。背景材料 |

## bank_v2.1.json 的字段

- `areas`：五个板块。键是 `C`（能力）、`W`（财富）、`N`（人脉）、`B`（身体）、`M`（心理），各有中文名、英文名和股票代码 `tick`。
- `order`：问卷里各板块出现的顺序。
- `section`：每个板块在答题页上显示的小标题。`G` 是最后一道社会阶梯题。
- `roles`：十一种身份，`id` 用于选题。
- `ages`：六个年龄段。
- `baseQ`：年龄和身份两道背景题的题干。
- `extra`：每种身份在年龄和身份之后追加的背景题。题目 `id` 有 `field`（领域）、`year`（年级）、`stage`（从业年数）、`exp`（工作经验）、`money`（开支来源）。
- `fieldIds`：`field` 题的选项下标对应的领域代码。
- `moneyIds`：`money` 题的选项下标对应的来源代码（`own`、`sup`、`hh`、`sup`、`own`）。
- `items`：每道题的 `area`（所属板块）、`load`（对各板块的载荷）、`versions`（版本，按顺序匹配）。
- 每个版本：`key`、`when`（适用条件，空对象表示兜底）、`q`（题干，中英）、`opts`（选项，中英）、`s`（每个选项的分值，0 到 1；`null` 表示这个选项不计分）、`pin`（打乱显示顺序时固定在最后的选项下标）。个别版本带 `load`（覆盖题目的载荷）、`tier`（每个选项对应的收入档位）、`mgr`（每个选项是否算管人）。
- `comp`：每种身份的题目序列。元素是题目 `id`，或者两种数组：
  - `["alt", 属性, 值, 甲, 乙]`：上下文里这个属性等于这个值时问甲，否则问乙。
  - `["skip", 属性, 值, 题]`：上下文里这个属性等于这个值时不问这道题。
- `timing`：计时折减的参数。`zh` 和 `en` 是每秒能扫读的字数和词数，`tmin`、`tmax` 是门槛的上下限（秒），`floor` 是系数的下限。

## 选题用的上下文

`role`、`money`、`field`、`nowork`、`tier`、`mgr` 六个属性。前四个来自背景题，`tier` 和 `mgr` 在答题过程中由带 `tier` 或 `mgr` 的版本写入。见 `items2.py` 的 `context`、`pick`、`resolve`、`run`。

## golden_vectors.json 的字段

每组 `case`：

- `lang`、`age`（年龄段下标）、`role`、`background`（背景题的选项下标）。
- `mode`：这组答案是怎么选的（`best`、`worst`、`mid`、`rand`）。`timing`：用时是怎么给的。`note`：有针对性的用例会写明要触发什么。
- `context`：答完之后的上下文。
- `steps`：按顺序的每一道题。`id`、`key`（版本）、`k`（选项下标）、`secs`（用时，`null` 表示没有计时）、`where`（点的是显示顺序里的第一个、中间还是最后一个）、`threshold`（门槛）、`multiplier`（系数）。
- `expect`：
  - `raw`：每个板块折减并校正之后的内部值。`keep`：计入权重的比例。
  - `price`：每个板块的股价。`priceFullWeight`：全部按原权重计算的股价。
  - `overall`、`overallFullWeight`：总价。`keepAll`：所有题的系数的平均。
  - `interestWrong`：利息题是否没答对。
  - `flags`：触发的一致性检查，格式是 `编号:分值`。`flagPoints`、`grade`：总分和数据评级。
  - `contrasts`：触发的反差。`mindAlert`：是否显示心理提示。
  - `rank`：板块按股价从高到低。
  - `objectivePrice`、`objectiveRung`、`ladder`、`gap`：社会位置一节的四个数。

标准答案里没有“跳过”的情况，因为测试页没有跳过按钮。跳过的规则写在 `PROMPT.md` 里，需要另写测试。
