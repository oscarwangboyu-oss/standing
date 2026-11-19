"""Standing check, version 1: the item bank. One source of truth for the questionnaire
document, the loading matrix, the business plan and the JSON export.
Each item: id, primary area, question (zh, en), options low-to-high as (zh, en) with an
optional explicit score, source (zh, en), and loadings on the six areas."""

AREAS = ["B", "W", "N", "E", "S", "M"]
AREA_NAME = {"B": ("身体", "Body"), "W": ("财富", "Wealth"), "N": ("人脉", "Network"),
             "E": ("学历", "Education"), "S": ("技能", "Skills"), "M": ("心理", "Mind")}

ITEMS = [
    # ---------------- body ----------------
    dict(id="B1", area="B",
         q=("总的来说，你觉得自己的健康状况怎么样？", "Would you say that in general your health is:"),
         opts=[("差", "Poor"), ("一般", "Fair"), ("好", "Good"), ("很好", "Very good"), ("非常好", "Excellent")],
         src=("美国疾控中心 BRFSS 核心题（公有领域）。荟萃分析显示自评“差”的人死亡风险约为“非常好”的两倍{3}", "CDC BRFSS core item (public domain). A meta-analysis found about twice the mortality risk for 'poor' against 'excellent'{3}"),
         load=dict(B=1.0, M=0.5, W=0.25)),
    dict(id="B2", area="B",
         q=("平常一周里，你做中等强度以上运动（快走、跑步、骑车、球类、健身）的时间合计多少分钟？", "In a typical week, how many minutes of moderate or vigorous activity do you do (brisk walking, running, cycling, sports, gym)?"),
         opts=[("不到 30 分钟", "Under 30"), ("30 至 89 分钟", "30 to 89"), ("90 至 149 分钟", "90 to 149"), ("150 至 299 分钟", "150 to 299"), ("300 分钟以上", "300 or more")],
         src=("世界卫生组织和美国身体活动指南建议每周 150 至 300 分钟{4}", "The WHO and the U.S. Physical Activity Guidelines recommend 150 to 300 minutes a week{4}"),
         load=dict(B=1.0, M=0.25)),
    dict(id="B3", area="B",
         q=("平均每 24 小时你睡多少小时？", "On average, how many hours of sleep do you get in a 24-hour period?"),
         opts=[("不到 5 小时", "Under 5", 0), ("5 至 6 小时", "5 to 6", 1), ("6 至 7 小时", "6 to 7", 2.5), ("7 至 9 小时", "7 to 9", 4), ("9 小时以上", "More than 9", 2.5)],
         src=("BRFSS 睡眠题（公有领域）。美国疾控中心建议成年人每晚至少 7 小时{4}", "BRFSS sleep item (public domain). The CDC recommends at least 7 hours a night for adults{4}"),
         load=dict(B=1.0, M=0.5)),
    dict(id="B4", area="B",
         q=("下面这些事，你今天不停下来能做到的最难的一项是哪个？", "Which is the hardest of these you could do today without stopping?"),
         opts=[("都做不到", "None of these", 0), ("正常速度走 1 英里（约 1.6 公里）", "Walk 1 mile at a normal pace", 0.8), ("快走 1 英里", "Walk 1 mile briskly", 1.6), ("慢跑 1 英里", "Jog 1 mile", 2.4), ("跑 5 公里", "Run 3 miles (5 km)", 3.2), ("跑 10 公里以上", "Run 6 miles (10 km) or more", 4), ("因伤病或身体条件，这道题不适用", "Not applicable because of an injury or a physical condition", None)],
         src=("原创题，用具体行为作为选项。行为锚定的题目比“你觉得自己体能如何”更不容易被高估。选“不适用”时本题不计分，由其余题目推算", "Original item with concrete behaviours as options. Behaviourally anchored items are harder to overstate than a general self-rating. The answer 'not applicable' is not scored and the area is estimated from the other questions"),
         load=dict(B=1.0, S=0.25)),
    dict(id="B5", area="B",
         q=("过去 30 天里，大约有多少天你因为身体或情绪不好，没法正常工作、学习或生活？", "During the past 30 days, for about how many days did poor physical or mental health keep you from your usual activities, such as work, study or recreation?"),
         opts=[("15 天以上", "15 or more"), ("8 至 14 天", "8 to 14"), ("3 至 7 天", "3 to 7"), ("1 至 2 天", "1 to 2"), ("0 天", "None")],
         src=("改编自美国疾控中心“健康天数”量表中的一题（公有领域）{5}", "Adapted from an item in the CDC Healthy Days measure (public domain){5}"),
         load=dict(B=1.0, M=0.75, W=0.25)),
    # ---------------- wealth ----------------
    dict(id="W1", area="W", route="money", variants=dict(sup=dict(
         q=("平均每个月，你可以支配的钱一共有多少？把家人或伴侣给的、奖学金和自己挣的加在一起，包含房租，不含学费。", "In an average month, how much money do you have to live on? Add up what family or a partner gives you, scholarships and what you earn; include rent and leave out tuition."),
         opts=[("不到 $500", "Under $500"), ("$500 至 $999", "$500 to $999"), ("$1,000 至 $1,499", "$1,000 to $1,499"), ("$1,500 至 $2,499", "$1,500 to $2,499"), ("$2,500 至 $3,999", "$2,500 to $3,999"), ("$4,000 以上", "$4,000 or more")],
         src=("原创题，用于主要靠他人支持生活的用户。没有收入不等于财务状况差，这里衡量的是实际可以支配的资源。区间为设计值，试测后按实际分布重新划分", "Original item for users who live mainly on support from others. Having no income does not mean poor finances; the item measures the resources actually available. Bands are design values, to be re-cut from the pilot distribution"),
         load=dict(W=1.0)),
         hh=dict(
         q=("过去 12 个月，你所在家庭的税前总收入是多少？", "What was the total income of your household before taxes in the past 12 months?"),
         opts=[("低于 $25,000", "Under $25,000"), ("$25,000 至 $49,999", "$25,000 to $49,999"), ("$50,000 至 $74,999", "$50,000 to $74,999"), ("$75,000 至 $124,999", "$75,000 to $124,999"), ("$125,000 至 $199,999", "$125,000 to $199,999"), ("$200,000 以上", "$200,000 or more")],
         src=("家庭版本，用于主要靠伴侣收入生活的用户。对没有个人收入的成年人，社会经济地位研究通常改用家庭收入衡量{29}。区间为设计值，试测后按实际分布重新划分", "Household version for users who live mainly on a partner's income. For adults without income of their own, research on socioeconomic position usually measures household income instead{29}. Bands are design values, to be re-cut from the pilot distribution"),
         load=dict(W=1.0))),
         q=("过去 12 个月，你个人的税前总收入是多少？自雇或自己经营的，按扣除经营成本之后的净收入算。", "What was your total personal income before taxes in the past 12 months? If you are self-employed or run a business, count your net income after business costs."),
         opts=[("低于 $15,000", "Under $15,000"), ("$15,000 至 $34,999", "$15,000 to $34,999"), ("$35,000 至 $59,999", "$35,000 to $59,999"), ("$60,000 至 $99,999", "$60,000 to $99,999"), ("$100,000 至 $159,999", "$100,000 to $159,999"), ("$160,000 以上", "$160,000 or more")],
         src=("区间参照美国人口普查局的收入统计，可按年龄换算成分位数。研究显示自雇者在调查中平均少报约 25% 的收入，所以题干写明按净收入填{28}", "Bands follow U.S. Census Bureau income statistics and can be converted to percentiles by age. Research finds that the self-employed underreport income in surveys by about 25 percent on average, so the stem states that net income is meant{28}"),
         load=dict(W=1.0, S=0.25, E=0.25)),
    dict(id="W2", area="W",
         q=("假如你突然需要支付一笔 $400 的紧急开支，你会怎么付？", "Suppose you had an emergency expense of $400. How would you pay for it?"),
         opts=[("现在付不出来", "I could not pay for it right now"), ("卖东西或者借贷款", "By selling something or taking a loan"), ("向家人或朋友借", "By borrowing from family or friends"), ("刷信用卡，分期慢慢还", "With a credit card that I pay off over time"), ("用现金、存款，或者下个账单全额还清的信用卡", "With cash, money in my account, or a credit card I pay off in full")],
         src=("改编自美联储家庭经济状况调查（SHED）的题目（公有领域），原题为多选，这里合并为单选。2025 年 63% 的成年人能用现金或等价物支付{6}", "Adapted from a question in the Federal Reserve's SHED survey (public domain); the original allows several answers and is reduced here to one. In 2025, 63% of adults would pay with cash or its equivalent{6}"),
         load=dict(W=1.0, M=0.25)),
    dict(id="W3", area="W", route="money", variants=dict(sup=dict(
         q=("如果你主要的经济来源（包括家人或伴侣的支持）中断，你自己的存款够维持多久的开支？", "If your main source of money stopped, including support from family or a partner, how long could you cover your expenses from your own savings?"))),
         q=("如果失去主要收入来源，你的存款够维持多久的开支？", "If you lost your main source of income, how long could you cover your expenses from savings?"),
         opts=[("不到 2 周", "Less than 2 weeks"), ("2 周至 1 个月", "2 weeks to 1 month"), ("1 至 3 个月", "1 to 3 months"), ("3 至 6 个月", "3 to 6 months"), ("6 个月以上", "More than 6 months")],
         src=("参照 SHED 的应急资金题。2025 年 55% 的成年人有够用三个月的应急资金{6}", "Based on the SHED rainy-day question. In 2025, 55% of adults had funds for three months{6}"),
         load=dict(W=1.0, M=0.25)),
    dict(id="W4", area="W", route="study", variants=dict(stu=dict(
         q=("把你名下的存款和投资加起来，减去信用卡欠款和私人借款，最接近哪个区间？学生贷款不算在内，另有一题单独问。", "Add up the savings and investments in your name and subtract credit card balances and personal loans. Which range is closest? Leave out student loans, which are asked about separately."),
         opts=[("负数", "Negative"), ("$0 至 $999", "$0 to $999"), ("$1,000 至 $4,999", "$1,000 to $4,999"), ("$5,000 至 $19,999", "$5,000 to $19,999"), ("$20,000 至 $49,999", "$20,000 to $49,999"), ("$50,000 以上", "$50,000 or more")],
         src=("学生版本：区间按学生的情况下调，学生贷款移到 W5 单独问。区间为设计值，试测后按实际分布重新划分", "Student version: bands are lowered to fit students, and student loans are moved to W5. Bands are design values, to be re-cut from the pilot distribution"))),
         q=("把你拥有的（存款、投资、房产净值、车）加起来，减去你欠的（贷款、信用卡），最接近哪个区间？", "Add up what you own (savings, investments, home equity, vehicles) and subtract what you owe (loans, credit cards). Which range is closest?"),
         opts=[("负数", "Negative"), ("$0 至 $9,999", "$0 to $9,999"), ("$10,000 至 $49,999", "$10,000 to $49,999"), ("$50,000 至 $149,999", "$50,000 to $149,999"), ("$150,000 至 $499,999", "$150,000 to $499,999"), ("$500,000 以上", "$500,000 or more")],
         src=("区间参照美联储消费者财务调查，35 岁以下家庭的中位数约 $33,000{7}", "Bands follow the Federal Reserve's Survey of Consumer Finances; the median under 35 is about $33,000{7}"),
         load=dict(W=1.0)),
    dict(id="W5", area="W", route="study", variants=dict(stu=dict(
         q=("到毕业时，你预计一共要背多少学生贷款？", "How much student loan debt do you expect to have in total when you graduate?"),
         opts=[("$60,000 以上", "$60,000 or more"), ("$30,000 至 $59,999", "$30,000 to $59,999"), ("$10,000 至 $29,999", "$10,000 to $29,999"), ("低于 $10,000", "Under $10,000"), ("没有贷款", "None")],
         src=("学生版本，原创题。在读期间多数学生贷款不需要还款，还债占比对学生没有区分度，改问预计的贷款总额。区间为设计值，试测后按实际分布重新划分", "Student version, original item. Most student loans need no payments during study, so the share of income going to debt does not separate students; the expected total is asked instead. Bands are design values, to be re-cut from the pilot distribution"))),
         q=("你每月的收入里，大约有多大比例用来还债（学生贷款、车贷、信用卡、房贷）？", "About what share of your monthly income goes to debt payments (student loans, car loan, credit cards, mortgage)?"),
         opts=[("36% 以上", "36% or more"), ("20% 至 35%", "20% to 35%"), ("10% 至 19%", "10% to 19%"), ("不到 10%", "Under 10%"), ("没有需要还的债", "No debt payments")],
         src=("负债收入比是贷款审批中的常用指标，36% 是常见的参考线", "The debt-to-income ratio is a standard underwriting measure, with 36% a common guideline"),
         load=dict(W=1.0, M=0.25)),
    dict(id="W6", area="W",
         q=("“因为我的经济状况，我觉得这辈子都得不到自己想要的东西。”这句话在多大程度上符合你？", "\"Because of my money situation, I feel like I will never have the things I want in life.\" How well does this describe you?"),
         opts=[("完全符合", "Completely"), ("很符合", "Very well"), ("有些符合", "Somewhat"), ("不太符合", "Very little"), ("完全不符合", "Not at all")],
         src=("美国消费者金融保护局财务状况量表中的一题（公有领域）{8}", "An item from the CFPB Financial Well-Being Scale (public domain){8}"),
         load=dict(W=0.75, M=0.75)),
    # ---------------- network ----------------
    dict(id="N1", area="N",
         q=("在你熟到可以请对方帮个小忙的人里，下面十种职业覆盖了几种？医生、律师、软件工程师、护士、教师、警察或消防员、电工或水管工、雇有员工的企业主、公司高管、教授或科研人员。", "Among people you know well enough to ask a small favour, how many of these ten occupations are covered? Doctor, lawyer, software engineer, nurse, teacher, police officer or firefighter, electrician or plumber, owner of a business with employees, senior executive, professor or scientist."),
         opts=[("0 至 1 种", "0 to 1"), ("2 至 3 种", "2 to 3"), ("4 至 5 种", "4 to 5"), ("6 至 7 种", "6 to 7"), ("8 至 10 种", "8 to 10")],
         src=("社会学的职位生成法，指标是能接触到的职业种类数{9}", "The position generator from sociology; the indicator is the number of occupations reached{9}"),
         load=dict(N=1.0, W=0.25, E=0.25)),
    dict(id="N2", area="N",
         q=("如果凌晨三点遇到严重的麻烦，你可以打电话给几个人？", "How many people could you call at 3 a.m. if you had a serious problem?"),
         opts=[("没有", "None"), ("1 个", "1"), ("2 个", "2"), ("3 至 5 个", "3 to 5"), ("6 个以上", "6 or more")],
         src=("衡量亲密关系的数量。荟萃分析显示社会关系较强的人存活的可能性高约 50%{10}", "Measures the number of close ties. A meta-analysis found about 50% greater likelihood of survival with stronger social relationships{10}"),
         load=dict(N=1.0, M=0.5, B=0.25)),
    dict(id="N3", area="N",
         q=("如果你开口，是否有认识的人能帮你做下面四件事：推荐一份工作；借给你 $1,000；提供法律或医疗方面的建议；把你引荐给你所在领域里能做决定的人。四件里有几件？", "Do you personally know someone who would do each of these if you asked: recommend you for a job; lend you $1,000; give you legal or medical advice; introduce you to a senior decision-maker in your field? How many of the four?"),
         opts=[("都没有", "None"), ("1 件", "1"), ("2 件", "2"), ("3 件", "3"), ("4 件都有", "All 4")],
         src=("社会学的资源生成法：问的是通过认识的人能得到什么具体帮助{9}", "The resource generator from sociology: what specific help can be obtained through acquaintances{9}"),
         load=dict(N=1.0, W=0.25, S=0.25)),
    dict(id="N4", area="N",
         q=("你积极参与的团体有几个（社团、球队、行业或学生组织、宗教或志愿团体）？", "How many groups do you take an active part in (clubs, teams, professional or student organizations, faith or volunteer groups)?"),
         opts=[("没有", "None"), ("1 个", "1"), ("2 个", "2"), ("3 个", "3"), ("4 个以上", "4 or more")],
         src=("社会资本研究中的团体参与指标", "The group participation indicator used in social capital research"),
         load=dict(N=1.0, M=0.25)),
    dict(id="N5", area="N",
         q=("你有没有导师，也就是比你有经验、并且在学业或事业上实际帮助你的人？", "Do you have a mentor: someone more experienced who actively helps your studies or career?"),
         opts=[("从来没有", "No, never"), ("现在没有，以前有过", "Not now, but in the past"), ("有，一年联系几次", "Yes, we talk a few times a year"), ("有，至少每月联系", "Yes, we talk at least monthly"), ("有不止一位", "Yes, more than one")],
         src=("原创题。有导师与职业发展之间的关联在组织行为研究中有较多证据", "Original item. The link between mentoring and career outcomes is well documented in organizational research"),
         load=dict(N=1.0, S=0.25, E=0.25)),
    dict(id="N6", area="N",
         q=("你多久会感到孤独？", "How often do you feel lonely?"),
         opts=[("经常或总是", "Often or always"), ("有些时候", "Some of the time"), ("偶尔", "Occasionally"), ("几乎没有", "Hardly ever"), ("从不", "Never")],
         src=("英国国家统计局推荐的孤独感直接测量题（开放政府许可）{11}", "The direct loneliness question recommended by the UK Office for National Statistics (Open Government Licence){11}"),
         load=dict(N=0.75, M=0.75)),
    # ---------------- education ----------------
    dict(id="E1", area="E", route="study", variants=dict(stu=dict(
         q=("你正在攻读哪一级学位？", "Which level of degree are you studying for?"),
         opts=[("副学士或证书课程", "Associate degree or certificate", 1.2), ("学士，一二年级", "Bachelor's, first or second year", 1.6), ("学士，三四年级", "Bachelor's, third or fourth year", 2.0), ("硕士或专业学位（MBA、JD、MD）", "Master's or professional degree (MBA, JD, MD)", 2.8), ("博士", "Doctorate", 3.6)],
         src=("学生版本。在读的学位按已完成的上下两级之间计分", "Student version. A degree in progress scores between the completed levels below and above it"))),
         q=("你已经完成的最高学历是什么？", "What is the highest level of education you have completed?"),
         opts=[("高中以下", "Less than high school"), ("高中或同等学历", "High school diploma or GED"), ("大学肄业、副学士或职业学校证书", "Some college, associate degree or trade school certificate"), ("学士", "Bachelor's degree"), ("硕士或专业学位（MBA、JD、MD）", "Master's or professional degree (MBA, JD, MD)"), ("博士", "Doctorate")],
         src=("美国人口普查局的受教育程度分类", "U.S. Census Bureau categories of educational attainment"),
         load=dict(E=1.0, W=0.25, S=0.25, N=0.25)),
    dict(id="E2", area="E",
         q=("你持有几项需要通过考试才能取得的专业执照或证书（例如 CPA、律师执照、PE、RN、CFA、PMP、电工或水管工执照、商业驾照、云计算或安全认证）？", "How many professional licences or certifications do you hold that required an exam (for example CPA, bar, PE, RN, CFA, PMP, an electrician's or plumber's licence, a commercial driver's licence, cloud or security certifications)?"),
         opts=[("没有", "None"), ("一项入门级的", "One at entry level"), ("一项高级的或州执照", "One advanced or state licence"), ("两项", "Two"), ("三项以上", "Three or more")],
         src=("原创题。证书属于制度化的文化资本，同时证明技能{1}", "Original item. Certificates are institutionalized cultural capital and also evidence of skill{1}"),
         load=dict(E=0.75, S=0.5)),
    dict(id="E3", area="E",
         q=("过去 12 个月，在必修的学位课程之外，你完成了大约多少小时的系统学习（课程、培训、工作坊）？", "In the past 12 months, about how many hours of structured learning did you complete (courses, training, workshops), beyond a required degree programme?"),
         opts=[("没有", "None"), ("不到 10 小时", "Under 10"), ("10 至 39 小时", "10 to 39"), ("40 至 99 小时", "40 to 99"), ("100 小时以上", "100 or more")],
         src=("参照经合组织成人技能调查（PIAAC）中关于参加培训的题目{12}", "Based on the items on participation in training in the OECD Survey of Adult Skills (PIAAC){12}"),
         load=dict(E=0.75, S=0.25, M=0.25)),
    dict(id="E4", area="E",
         q=("过去 12 个月，不算必读的，你读完了几本书？", "How many books did you finish in the past 12 months, not counting required reading?"),
         opts=[("没有", "None"), ("1 至 3 本", "1 to 3"), ("4 至 11 本", "4 to 11"), ("12 至 24 本", "12 to 24"), ("25 本以上", "25 or more")],
         src=("文化资本的常用指标。英国阶层大调查也用文化活动的参与来衡量{1,2}", "A standard indicator of cultural capital. The Great British Class Survey also measured participation in cultural activities{1,2}"),
         load=dict(E=0.75, S=0.25, M=0.25)),
    dict(id="E5", area="E",
         q=("你的学业或专业成果有没有得到过正式认可（奖学金、荣誉学位、发表的论文、专利、行业奖项）？", "Have you received formal recognition for academic or professional work (scholarship, honours, published paper, patent, industry award)?"),
         opts=[("没有", "None"), ("一项，校级或地方级", "One, at school or local level"), ("多项，校级或地方级", "Several, at school or local level"), ("一项，全国级", "One, at national level"), ("多项，全国或国际级", "Several, at national or international level")],
         src=("原创题。衡量学历之外、可以查证的学业成就", "Original item. Measures verifiable academic achievement beyond the degree itself"),
         load=dict(E=0.75, S=0.25, N=0.25)),
    # ---------------- skills ----------------
    dict(id="S1", area="S", route="work",
         q=("下面哪一项最符合你现在的工作？", "Which best describes your current work?"),
         opts=[('初级、服务或辅助性工作', 'Entry-level, service or support work', 0.8), ('技工、技术员或助理专业人员', 'Skilled trade, technician or associate professional', 1.6), ('专业人员（如工程师、分析师、护士、教师）', 'Professional (for example engineer, analyst, nurse, teacher)', 2.4), ('经理或资深专业人员', 'Manager or senior professional', 3.2), ('高管，或雇有员工的创始人', 'Executive, or founder with employees', 4)],
         src=("受雇版本。参照国际标准职业分类的技能等级和 Hollingshead 的职业量表{13}", "Version for employees. Follows the skill levels of the International Standard Classification of Occupations and Hollingshead's occupational scale{13}"),
         load=dict(S=0.75, W=0.5, E=0.25, N=0.25),
         variants=dict(
             stu=dict(q=("到目前为止，你最有分量的一段实践经历是什么？", "What is the most substantial practical experience you have had so far?"),
                      opts=[("还没有", "None yet"), ("校内兼职、助教或志愿服务", "Campus job, teaching assistant or volunteering"), ("一段实习或研究助理", "One internship or research assistantship"), ("多段实习，或在学生组织、项目里担任负责人", "Several internships, or a leading role in a student organization or project"), ("创办过有用户或有收入的项目，或已拿到全职录用", "Founded a project with users or revenue, or hold a full-time offer")],
                      src=("学生版本，原创题。学生没有职业层级，改用实践经历衡量。英国的社会经济分类同样把全日制学生放在职业阶层之外{27}", "Student version, original item. Students have no level of occupation, so practical experience is measured instead. The UK socio-economic classification likewise places full-time students outside the occupational classes{27}"),
                      load=dict(S=0.75, N=0.25, E=0.25)),
             self=dict(q=("你的业务或自由职业现在处在什么阶段？", "What stage is your business or freelance work at?"),
                      opts=[("刚起步，还没有稳定的收入", "Just starting, with no steady income yet"), ("有收入，但还不够生活", "Earning, but not enough to live on"), ("是我的主要收入，够我生活", "My main income, and enough to live on"), ("收入稳定，并雇人或长期外包", "Steady income, with employees or regular contractors"), ("雇有 10 人以上", "Ten or more employees")],
                      src=("自雇版本，原创题。自雇者没有职位层级，按经营阶段衡量。英国的社会经济分类把小雇主和自营者单列为一类{27}", "Version for the self-employed, original item. The self-employed have no job grade, so the stage of the business is measured. The UK socio-economic classification treats small employers and own-account workers as a class of their own{27}"),
                      load=dict(S=0.75, W=0.5, E=0.25, N=0.25)),
             last=dict(q=("你最近一份工作（或退休前的主要工作）属于哪一类？", "Which best describes your most recent job, or your main job before retiring?"),
                      opts=[('还没有工作过', 'I have not had a job yet', 0), ('初级、服务或辅助性工作', 'Entry-level, service or support work', 0.8), ('技工、技术员或助理专业人员', 'Skilled trade, technician or associate professional', 1.6), ('专业人员（如工程师、分析师、护士、教师）', 'Professional (for example engineer, analyst, nurse, teacher)', 2.4), ('经理或资深专业人员', 'Manager or senior professional', 3.2), ('高管，或雇有员工的创始人', 'Executive, or founder with employees', 4)],
                      src=("用于求职、全职照顾家庭、退休等情况：按最近一份工作的层级计", "For people looking for work, caring for family full-time, retired and similar: the level of the most recent job"),
                      load=dict(S=0.75, W=0.25, E=0.25, N=0.25)))),
    dict(id="S2", area="S",
         q=("你能用几种语言进行工作上的交流（大约相当于欧洲标准 B2 水平）？", "In how many languages can you hold a work conversation (about level B2)?"),
         opts=[("一种", "One"), ("一种，正在学另一种", "One, and I am learning another"), ("两种", "Two"), ("三种", "Three"), ("四种以上", "Four or more")],
         src=("水平参照欧洲语言共同参考框架的自评表{14}", "The level follows the self-assessment grid of the Common European Framework of Reference for Languages{14}"),
         load=dict(S=1.0, E=0.25, N=0.25)),
    dict(id="S3", area="S",
         q=("不靠别人帮忙，你在电脑上能做到的最高级的事情是哪一项？", "What is the most advanced thing you can do on a computer without help?"),
         opts=[("用邮件、应用和搜索", "Use email, apps and web search"), ("做带公式的表格，或者剪辑照片和视频", "Build a spreadsheet with formulas, or edit photos or video"), ("分析数据或者把重复的工作自动化（数据透视表、SQL、无代码工具）", "Analyse data or automate a task (pivot tables, SQL, no-code tools)"), ("写出能运行的代码或脚本", "Write working code or scripts"), ("开发并发布软件，或者带领技术项目", "Build and release software, or lead a technical project")],
         src=("等级参照欧盟数字能力框架（DigComp）{14}", "Levels follow the EU Digital Competence Framework (DigComp){14}"),
         load=dict(S=1.0, W=0.25, E=0.25)),
    dict(id="S4", area="S",
         q=("假设你在储蓄账户里存了 $100，年利率 2%。把钱一直放着，5 年后账户里有多少钱？", "Suppose you had $100 in a savings account and the interest rate was 2% per year. After 5 years, how much would you have if you left the money to grow?"),
         opts=[("不知道", "Don't know", 0), ("少于 $102", "Less than $102", 0), ("正好 $102", "Exactly $102", 0), ("多于 $102", "More than $102", 4)],
         src=("Lusardi 和 Mitchell 的财务素养“三大问题”之一，出自美国健康与退休研究{15}。这是全卷唯一有标准答案的题，用来校准自报内容", "One of Lusardi and Mitchell's 'Big Three' financial literacy questions, from the U.S. Health and Retirement Study{15}. It is the only item with a correct answer and anchors the self-reports"),
         load=dict(S=0.75, W=0.5, E=0.25)),
    dict(id="S5", area="S",
         q=("在你的主要工作或专业领域里，下面哪一项最符合你现在的水平？", "In your main field of work or study, which best describes your present level?"),
         opts=[("刚入门，需要别人一步步带着做", "Starting out: I need step-by-step guidance"), ("能独立完成常规的任务", "I complete routine tasks on my own"), ("能独立处理没遇到过的问题", "I handle problems I have not met before on my own"), ("别人会来请教我，我带过新人", "Others come to me for advice, and I have trained newcomers"), ("在本领域里被公认：受邀授课、评审或制定标准", "Recognized in the field: invited to teach, judge or set standards")],
         src=("原创题，等级参照 Dreyfus 的技能习得五阶段模型{26}。题目不分行业，技工、护士、程序员和厨师都能作答", "Original item; the levels follow the Dreyfus five-stage model of skill acquisition{26}. The question is neutral across fields, so a tradesperson, a nurse, a programmer and a cook can all answer it"),
         load=dict(S=1.0, W=0.25, E=0.25)),
    dict(id="S6", area="S",
         q=("过去 12 个月，在正式工作或学业之外，有没有人为你的某项技能付过钱（接私活、家教、设计、编程、教练、演出）？", "In the past 12 months, has anyone paid you for a skill outside a regular job or your studies (freelance work, tutoring, design, coding, coaching, performing)?"),
         opts=[("没有", "No"), ("一两次", "Once or twice"), ("经常有，金额不大", "Regularly, small amounts"), ("经常有，占收入的相当一部分", "Regularly, a meaningful part of my income"), ("这就是我的主要收入", "It is my main income")],
         src=("原创题。市场是否愿意付钱，是技能最直接的外部证明", "Original item. Whether the market pays is the most direct outside evidence of a skill"),
         load=dict(S=0.75, W=0.5, N=0.25)),
    dict(id="S7", area="S",
         q=("在工作和学习之外，你在任何一项爱好上达到过的最高水平是什么（运动、音乐、美术、手工、棋类、烹饪、游戏）？", "Outside work or study, what is the highest level you have reached in any pursuit (a sport, music, art, craft, chess, cooking, a game)?"),
         opts=[("没有", "None"), ("入门", "Beginner"), ("中等", "Intermediate"), ("高级：在本地演出、展览或比赛", "Advanced: I perform, exhibit or compete locally"), ("专业：有人付费、授课，或参加全国级比赛", "Expert: I am paid, teach, or compete nationally")],
         src=("原创题。身体化的文化资本{1}。运动水平也算在内", "Original item. Embodied cultural capital{1}. Level in a sport counts as well"),
         load=dict(S=0.75, B=0.25, E=0.25, M=0.25, N=0.25)),
    # ---------------- mind ----------------
    dict(id="M1", area="M",
         q=("总的来说，你对现在的生活有多满意？（0 分完全不满意，10 分完全满意）", "Overall, how satisfied are you with your life nowadays? (0 is not at all, 10 is completely)"),
         opts=[("0 至 2", "0 to 2"), ("3 至 4", "3 to 4"), ("5 至 6", "5 to 6"), ("7 至 8", "7 to 8"), ("9 至 10", "9 to 10")],
         src=("英国国家统计局个人幸福感四题之一（开放政府许可）{11}，与生活满意度量表测的是同一个概念{16}", "One of the four UK ONS personal well-being questions (Open Government Licence){11}; the same construct as the Satisfaction With Life Scale{16}"),
         load=dict(M=1.0, W=0.25, N=0.25, B=0.25)),
    dict(id="M2", area="M",
         q=("总的来说，你觉得自己在生活中做的事情有多大的价值？（0 分完全没有，10 分非常有价值）", "Overall, to what extent do you feel that the things you do in your life are worthwhile? (0 is not at all, 10 is completely)"),
         opts=[("0 至 2", "0 to 2"), ("3 至 4", "3 to 4"), ("5 至 6", "5 to 6"), ("7 至 8", "7 to 8"), ("9 至 10", "9 to 10")],
         src=("英国国家统计局个人幸福感四题之一{11}，对应“意义与目标”", "One of the four UK ONS personal well-being questions{11}; corresponds to meaning and purpose"),
         load=dict(M=1.0, S=0.25)),
    dict(id="M3", area="M",
         q=("过去两周，你有多少天感到紧张、焦虑或心神不宁？", "Over the last 2 weeks, how often have you been bothered by feeling nervous, anxious or on edge?"),
         opts=[("几乎每天", "Nearly every day"), ("一半以上的日子", "More than half the days"), ("有几天", "Several days"), ("完全没有", "Not at all")],
         src=("GAD-7 量表第一题，可自由使用，无需许可{17}", "The first item of the GAD-7, free to use without permission{17}"),
         load=dict(M=1.0, B=0.25)),
    dict(id="M4", area="M",
         q=("过去两周，你有多少天做什么事都提不起兴趣、感受不到乐趣？", "Over the last 2 weeks, how often have you been bothered by little interest or pleasure in doing things?"),
         opts=[("几乎每天", "Nearly every day"), ("一半以上的日子", "More than half the days"), ("有几天", "Several days"), ("完全没有", "Not at all")],
         src=("PHQ-9 量表第一题，可自由使用，无需许可{17}", "The first item of the PHQ-9, free to use without permission{17}"),
         load=dict(M=1.0, B=0.25)),
    dict(id="M5", area="M",
         q=("事情出了岔子之后，你通常要多久才能回到正轨？", "When something goes wrong, how long does it usually take you to get back on track?"),
         opts=[("往往一直陷在里面", "I tend to stay stuck"), ("一个月以上", "A month or more"), ("一两周", "A week or two"), ("几天", "A few days"), ("一天之内", "A day or less")],
         src=("原创题，测的是心理韧性，概念参照简明韧性量表{18}", "Original item measuring resilience; the construct follows the Brief Resilience Scale{18}"),
         load=dict(M=1.0, S=0.25)),
    dict(id="M6", area="M",
         q=("过去一个月，你有多经常觉得生活中重要的事情在自己的掌控之中？", "In the past month, how often have you felt in control of the important things in your life?"),
         opts=[("从不", "Never"), ("很少", "Rarely"), ("有时", "Sometimes"), ("经常", "Often"), ("几乎总是", "Almost always")],
         src=("原创题，测的是掌控感，概念参照知觉压力量表{18}", "Original item measuring sense of control; the construct follows the Perceived Stress Scale{18}"),
         load=dict(M=1.0, W=0.25)),
    # ---------------- global ----------------
    dict(id="G1", area="G",
         q=("想象一架十级的梯子，代表美国社会中人们所处的位置。最上面是境况最好的人：钱最多、学历最高、工作最好。最下面是境况最差的人。你觉得自己站在第几级？", "Think of a ladder with 10 rungs representing where people stand in the United States. At the top are the people who are best off: most money, most education, best jobs. At the bottom are those who are worst off. Which rung are you on?"),
         opts=[("第 1 至 2 级", "Rungs 1 to 2"), ("第 3 至 4 级", "Rungs 3 to 4"), ("第 5 至 6 级", "Rungs 5 to 6"), ("第 7 至 8 级", "Rungs 7 to 8"), ("第 9 至 10 级", "Rungs 9 to 10")],
         src=("MacArthur 主观社会地位量表{19}。荟萃分析显示它在扣除客观指标后仍与健康有独立关联", "The MacArthur Scale of Subjective Social Status{19}. A meta-analysis shows an association with health independent of objective measures"),
         load=dict(W=0.5, E=0.5, M=0.5, S=0.25, N=0.25)),
]

PROFILE = [
    dict(id="P1", q=("你的年龄段", "Your age group"), opts=[("18 至 20", "18 to 20"), ("21 至 24", "21 to 24"), ("25 至 29", "25 to 29"), ("30 至 34", "30 to 34"), ("35 至 44", "35 to 44"), ("45 以上", "45 or over")]),
    dict(id="P2", q=("下面哪一项最符合你现在的主要状态？", "Which best describes your main situation now?"),
         opts=[("全日制学生", "Full-time student"), ("受雇工作（全职或兼职）", "Employed, full-time or part-time"), ("自雇、自由职业或创业", "Self-employed, freelance or running a business"), ("正在找工作，或处在两份工作之间", "Looking for work, or between jobs"), ("全职照顾家庭", "Caring for family full-time"), ("已退休，或其他", "Retired, or other")]),
    dict(id="P3", q=("你的日常开支主要靠什么？", "What mainly pays for your day-to-day living?"),
         opts=[("我自己的工作或经营收入", "My own earnings"), ("家人的支持", "Support from family"), ("伴侣或配偶的收入", "A partner's or spouse's income"), ("奖学金、助学金或学生贷款", "Scholarships, grants or student loans"), ("存款、退休金、补助或其他", "Savings, a pension, benefits or other")]),
    dict(id="P4", q=("你工作或学习的主要领域是什么？没有工作的，按最近一份工作或所学专业选。", "What is your main field of work or study? If you are not working, choose by your most recent job or your field of study."),
         opts=[("科技与工程", "Technology and engineering"), ("商业、金融与法律", "Business, finance and law"), ("医疗与健康", "Health care"), ("教育与科研", "Education and research"), ("艺术、设计、媒体与体育", "Arts, design, media and sport"), ("销售、餐饮、零售与服务", "Sales, food, retail and service"), ("建筑、制造、维修与运输", "Construction, manufacturing, repair and transport"), ("政府、军队、公共安全与社会服务", "Government, military, public safety and social services"), ("农业与自然资源", "Agriculture and natural resources"), ("其他或尚未确定", "Other or undecided")]),
    dict(id="P5", q=("你所在的州（选填；美国以外另列）", "Your state (optional; a separate option outside the United States)"), opts=[]),
]
ROLE_OF = ["stu", "emp", "self", "gap", "care", "oth"]      # by answer to P2
MONEY_OF = ["own", "sup", "hh", "sup", "own"]              # by answer to P3
ROLE_NAME = {"stu": ("学生", "Student"), "emp": ("受雇", "Employed"), "self": ("自雇或创业", "Self-employed"),
             "gap": ("求职或过渡期", "Between jobs"), "care": ("全职照顾家庭", "Caring for family"), "oth": ("退休或其他", "Retired or other")}
MONEY_NAME = {"own": ("靠自己的收入", "Own income"), "sup": ("靠家人、奖学金或贷款", "Family, scholarships or loans"), "hh": ("靠伴侣的收入", "A partner's income")}
WORK_FORM = {"stu": "stu", "self": "self", "gap": "last", "care": "last", "oth": "last"}


def variant_key(item, role="emp", money="own"):
    r = item.get("route")
    if r == "money":
        return money if money in ("sup", "hh") else None
    if r == "study":
        return "stu" if role == "stu" else None
    if r == "work":
        return WORK_FORM.get(role)
    return None


def resolve(item, role="emp", money="own"):
    """The version of an item shown to a given group."""
    v = item.get("variants", {}).get(variant_key(item, role, money))
    return {**item, **v} if v else item


# ---- response time: expected time per item and the discount for answers given too fast ----
READ_EN = 238 / 60      # words a second, silent reading of non-fiction (Brysbaert 2019)
READ_ZH = 380 / 60      # characters a second; a design value converted from the English rate
DECIDE = 1.5            # seconds allowed for choosing an answer
FULL_AT = 0.5           # an answer counts in full from this share of the expected time
FLOOR = 0.2             # the lowest multiplier


def read_units(text, lang):
    import re
    if lang == "en":
        return len(text.split())
    return len(re.findall(r"[\u4e00-\u9fff]", text)) + len(re.findall(r"[A-Za-z0-9$,.%]+", text))


def expected_seconds(item, lang):
    i = 0 if lang == "zh" else 1
    text = item["q"][i] + " " + " ".join(o[i] for o in item["opts"])
    return read_units(text, lang) / (READ_ZH if lang == "zh" else READ_EN) + DECIDE


def time_multiplier(seconds, expected):
    if seconds is None:
        return 1.0
    return max(FLOOR, min(1.0, seconds / (FULL_AT * expected)))


def score_of(item, k):
    o = item["opts"][k]
    if len(o) > 2:
        return o[2]
    return 4.0 * k / (len(item["opts"]) - 1)


PRIMARY_SHARE = 2 / 3   # share of an area's weight carried by its own items


for _it in ITEMS:
    if _it["id"] == "W3":
        _it["variants"]["hh"] = _it["variants"]["sup"]


def eff_weights():
    """Effective weight of every item in every area. An area's own items carry two thirds of
    the weight and items from other areas one third, each group in proportion to its loadings."""
    out = {}
    for a in AREAS:
        pri = sum(it["load"].get(a, 0) for it in ITEMS if it["area"] == a)
        sec = sum(it["load"].get(a, 0) for it in ITEMS if it["area"] != a)
        for it in ITEMS:
            w = it["load"].get(a, 0)
            if not w:
                continue
            out[(it["id"], a)] = PRIMARY_SHARE * w / pri if it["area"] == a else (1 - PRIMARY_SHARE) * w / sec
    return out


def overlap():
    """Cosine similarity between the effective weight vectors of two areas."""
    import math
    ew = eff_weights()
    vec = {a: [ew.get((it["id"], a), 0) for it in ITEMS] for a in AREAS}
    norm = {a: math.sqrt(sum(x * x for x in vec[a])) for a in AREAS}
    return {(a, b): sum(x * y for x, y in zip(vec[a], vec[b])) / (norm[a] * norm[b]) for a in AREAS for b in AREAS}


def stats():
    n = len(ITEMS)
    per_area = {a: sum(1 for it in ITEMS if it["load"].get(a)) for a in AREAS}
    primary = {a: sum(1 for it in ITEMS if it["area"] == a) for a in AREAS}
    avg = sum(len(it["load"]) for it in ITEMS) / n
    multi = sum(1 for it in ITEMS if len(it["load"]) >= 3)
    links = sum(len(it["load"]) for it in ITEMS)
    return dict(n=n, per_area=per_area, primary=primary, avg=avg, multi=multi, links=links)
