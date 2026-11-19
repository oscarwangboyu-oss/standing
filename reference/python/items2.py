"""Standing check, version 2.1: an item bank written persona by persona.
Five areas: body, wealth, network, capability, mind. Each of eleven situations (bachelor's
student, community college student, graduate student, employee, part-time or gig worker,
freelancer, business owner, job seeker, full-time carer, retiree, other) has its own list of
questions; a question that does not fit a situation is replaced or left out, so the number of
questions differs (31 to 34). Later questions depend on earlier answers: the first wealth
answer sets an income tier, and employees who manage people are asked about their team.
Within a group the best answer to any question scores 1, so a person who gives the best
answer everywhere reaches the top whatever their situation.
Texts shared with version 1 are taken from items.py."""
import math
import re
import items as V1

v1 = {it["id"]: it for it in V1.ITEMS}
AREAS = ["C", "W", "N", "B", "M"]        # order of the blocks in the questionnaire
AREA_NAME = {"B": ("身体", "Body"), "W": ("财富", "Wealth"), "N": ("人脉", "Network"), "C": ("能力", "Capability"), "M": ("心理", "Mind")}
TICKER = {"B": "BODY", "W": "WLTH", "N": "NETW", "C": "SKIL", "M": "MIND"}
SECTION = {"C": ("学习、工作与能力", "Study, work and capability"), "W": ("财务", "Money"), "N": ("人脉", "People"),
           "B": ("身体", "Body"), "M": ("状态", "State of mind"), "G": ("位置", "Position")}
PRIMARY_SHARE = 2 / 3

# ---------------- profile (not scored) ----------------
ROLES = [("ug4", "本科在读", "Bachelor's student"),
         ("cc", "大专或社区学院在读", "Community college or associate student"),
         ("grad", "研究生在读（硕士、博士、专业学位）", "Graduate student (master's, doctorate, professional degree)"),
         ("emp", "全职受雇", "Employed full-time"),
         ("gig", "兼职、零工或同时做几份工作", "Part-time, gig work or several jobs"),
         ("free", "自由职业或个体经营（没有雇员）", "Freelance or sole proprietor (no employees)"),
         ("owner", "公司创始人或企业主（有雇员或合伙人）", "Founder or business owner (with employees or partners)"),
         ("seek", "正在找工作，或处在两份工作之间", "Looking for work, or between jobs"),
         ("care", "全职照顾家庭", "Caring for family full-time"),
         ("ret", "已退休", "Retired"),
         ("oth", "其他", "Other")]
STUDENT = ["ug4", "cc", "grad"]
FIELDS = [("tech", "科技与工程", "Technology and engineering", "云计算或网络安全认证、PE 工程师执照、PMP", "cloud or security certifications, a PE licence, PMP"),
          ("biz", "商业、金融与咨询", "Business, finance and consulting", "CPA、CFA、PMP、证券从业资格", "CPA, CFA, PMP, securities licences"),
          ("law", "法律", "Law", "律师执照、专利代理人资格", "bar admission, patent agent registration"),
          ("health", "医疗与健康", "Health care", "护士执照 RN、医师执照、专科认证", "RN, a medical licence, board certification"),
          ("edu", "教育与科研", "Education and research", "教师资格证、学科或语言教学认证", "a teaching credential, subject or language teaching certification"),
          ("arts", "艺术、设计与媒体", "Arts, design and media", "乐器或舞蹈等级证书、设计软件认证", "graded music or dance exams, design software certification"),
          ("sport", "体育与健身", "Sports and fitness", "教练或裁判证书、私人教练认证", "coaching or referee certification, personal trainer certification"),
          ("sales", "销售、零售、餐饮与服务", "Sales, retail, food and hospitality", "房地产经纪执照、保险销售执照、食品安全经理证", "a real estate licence, an insurance licence, food safety manager certification"),
          ("trade", "技工、建筑与制造", "Skilled trades, construction and manufacturing", "电工或水管工执照、焊接认证、暖通空调执照", "an electrician's or plumber's licence, welding certification, an HVAC licence"),
          ("move", "运输与物流", "Transport and logistics", "商业驾照 CDL、飞行执照、叉车操作证", "a commercial driver's licence, a pilot's licence, forklift certification"),
          ("gov", "政府、军队与公共安全", "Government, military and public safety", "急救员 EMT 认证、执法或消防资格", "EMT certification, law enforcement or firefighter certification"),
          ("care", "公益与社会服务", "Nonprofit and social services", "社工执照、心理咨询执照", "a social work licence, a counselling licence"),
          ("agri", "农业与自然资源", "Agriculture and natural resources", "农药施用执照、兽医技师执照", "a pesticide applicator's licence, a veterinary technician's licence"),
          ("oth", "其他或尚未确定", "Other or undecided", "CPA、律师执照、护士执照、电工执照、商业驾照、云计算认证", "CPA, bar admission, RN, an electrician's licence, a commercial driver's licence, cloud certification")]
AGES = [("18 至 20", "18 to 20"), ("21 至 24", "21 to 24"), ("25 至 29", "25 to 29"), ("30 至 34", "30 to 34"), ("35 至 44", "35 to 44"), ("45 以上", "45 or over")]
MONEY = [("own", "我自己的工作或经营收入", "My own earnings"), ("sup", "家人的支持", "Support from family"), ("hh", "伴侣或配偶的收入", "A partner's or spouse's income"),
         ("sup", "奖学金、助学金或学生贷款", "Scholarships, grants or student loans"), ("own", "存款、退休金、补助或其他", "Savings, a pension, benefits or other")]
YEARS = [("不到 2 年", "Under 2 years"), ("2 至 5 年", "2 to 5 years"), ("6 至 10 年", "6 to 10 years"), ("11 至 20 年", "11 to 20 years"), ("20 年以上", "More than 20 years")]
F_OPTS = [(f[1], f[2]) for f in FIELDS]
M_OPTS = [(m[1], m[2]) for m in MONEY]
Q_MONEY = dict(id="money", q=("你的日常开支主要靠什么？", "What mainly pays for your day-to-day living?"), opts=M_OPTS)
Q_STUDY = dict(id="field", q=("你学的专业属于哪一类？", "Which area is your subject in?"), opts=F_OPTS)
Q_WORK = dict(id="field", q=("你工作的主要领域是什么？", "What is your main field of work?"), opts=F_OPTS)
Q_STAGE = dict(id="stage", q=("你在这个领域工作了多少年？", "How many years have you worked in this field?"), opts=YEARS)
# background questions after age and situation, by situation; only what is used later is asked
EXTRA = {
    "ug4": [Q_STUDY, dict(id="year", q=("你现在读几年级？", "Which year are you in?"), opts=[("一年级", "First year"), ("二年级", "Second year"), ("三年级", "Third year"), ("四年级或以上", "Fourth year or later")]), Q_MONEY],
    "cc": [Q_STUDY, dict(id="year", q=("你现在读第几年？", "Which year are you in?"), opts=[("第一年", "First year"), ("第二年或以上", "Second year or later")]), Q_MONEY],
    "grad": [Q_STUDY, dict(id="year", q=("你正在攻读哪一级学位？", "Which degree are you studying for?"), opts=[("硕士", "Master's"), ("专业学位（MBA、JD、MD）", "Professional degree (MBA, JD, MD)"), ("博士，尚未通过资格考试", "Doctorate, before candidacy"), ("博士候选人", "Doctoral candidate")]), Q_MONEY],
    "emp": [Q_WORK, Q_STAGE], "free": [Q_WORK, Q_STAGE], "owner": [Q_WORK, Q_STAGE], "gig": [Q_WORK, Q_STAGE, Q_MONEY],
    "seek": [dict(id="field", q=("你最近一份工作，或者正在找的工作，属于哪个领域？", "Which field is your most recent job, or the job you are looking for, in?"), opts=F_OPTS),
             dict(id="exp", q=("你一共有多少年的工作经验？", "How many years of work experience do you have in all?"), opts=[("还没有工作过", "None yet")] + YEARS), Q_MONEY],
    "care": [Q_MONEY], "ret": [Q_MONEY], "oth": [Q_MONEY],
}
BASE_Q = {"age": ("你的年龄段", "Your age group"), "role": ("下面哪一项最符合你现在的主要状态？", "Which best describes your main situation now?")}
ROLE_NAME = {r[0]: (r[1], r[2]) for r in ROLES}


def context(role, answers):
    """Routing attributes from the background answers (indices by question id)."""
    ids = [q["id"] for q in EXTRA[role]]
    return dict(role=role,
                money=MONEY[answers["money"]][0] if "money" in ids else "own",
                field=FIELDS[answers["field"]][0] if "field" in ids else None,
                nowork=1 if "exp" in ids and answers["exp"] == 0 else 0,
                tier=None, mgr=0)


# ---------------- scoring helpers ----------------
def lin(n):
    return [k / (n - 1) for k in range(n)]


def from_v1(x):
    return [None if V1.score_of(x, k) is None else V1.score_of(x, k) / 4 for k in range(len(x["opts"]))]


def usd(mids, lo, hi):
    """Score a dollar band by where its midpoint lies between lo and hi on a log scale, so that
    different sets of bands shown within one group land on one common scale."""
    return [0.0 if m is None else max(0.0, min(1.0, math.log(m / lo) / math.log(hi / lo))) for m in mids]


def tiered(n, lo, hi):
    return [lo + (hi - lo) * k / (n - 1) for k in range(n)]


def ver(key, x, when=None, s=None, **extra):
    d = dict(key=key, when=when or {}, q=x["q"], opts=[(o[0], o[1]) for o in x["opts"]], s=s if s is not None else from_v1(x))
    d.update(extra)
    return d


def new(key, q, opts, when=None, s=None, **extra):
    d = dict(key=key, when=when or {}, q=q, opts=opts, s=s if s is not None else lin(len(opts)))
    d.update(extra)
    return d


BASE7 = [("低于 $15,000", "Under $15,000"), ("$15,000 至 $34,999", "$15,000 to $34,999"), ("$35,000 至 $59,999", "$35,000 to $59,999"), ("$60,000 至 $99,999", "$60,000 to $99,999"),
         ("$100,000 至 $159,999", "$100,000 to $159,999"), ("$160,000 至 $299,999", "$160,000 to $299,999"), ("$300,000 以上", "$300,000 or more")]
BASE7_S = usd([10_000, 25_000, 47_500, 80_000, 130_000, 230_000, 450_000], 8_000, 450_000)
BASE7_TIER = ["low", "low", "mid", "mid", "mid", "high", "high"]
NW_LO, NW_HI = 500, 7_500_000
W2_OPTS = v1["W2"]["opts"]
N3_OPTS = v1["N3"]["opts"]
AGREE = v1["W6"]["opts"]            # completely ... not at all
TEAM_OPTS = [("没有", "None"), ("1 至 4 人", "1 to 4"), ("5 至 19 人", "5 to 19"), ("20 至 99 人", "20 to 99"), ("100 人以上", "100 or more")]
LEVELS = [("需要别人带着做", "I need guidance from others"), ("能独立完成常规的工作", "I complete routine work on my own"), ("能独立处理没遇到过的问题", "I handle problems I have not met before on my own"),
          ("别人会来请教我，我带过新人", "Others come to me for advice, and I have trained newcomers"), ("在行业里有一定名气：受邀分享、评审或参与制定标准", "Known in the field: invited to speak, judge or help set standards")]
N1_OPTS_STU = [("0 至 1 类", "0 to 1"), ("2 至 3 类", "2 to 3"), ("4 至 5 类", "4 to 5"), ("6 至 7 类", "6 to 7"), ("8 至 10 类", "8 to 10")]


def w2(key, amt, when, lo, hi):
    return new(key, (f"假如你突然需要支付一笔 {amt} 的紧急开支，你会怎么付？", f"Suppose you had an emergency expense of {amt}. How would you pay for it?"), W2_OPTS, when, tiered(5, lo, hi))


def n3(key, zh, en, when=None):
    return new(key, (f"如果你开口，是否有认识的人能帮你做下面四件事：{zh}。四件里有几件？", f"Do you personally know someone who would do each of these if you asked: {en}? How many of the four?"), N3_OPTS, when)


def n3job(key, amt, when):
    return n3(key, f"推荐一份工作；借给你 {amt}；提供法律或医疗方面的建议；把你引荐给你所在领域里能做决定的人",
              f"recommend you for a job; lend you {amt}; give you legal or medical advice; introduce you to a senior decision-maker in your field", when)


ITEMS = {
    # ---------------- body: the same for everyone ----------------
    "B1": dict(area="B", load=dict(B=1, M=0.5, W=0.25), versions=[ver("base", v1["B1"])]),
    "B2": dict(area="B", load=dict(B=1, M=0.25), versions=[ver("base", v1["B2"])]),
    "B3": dict(area="B", load=dict(B=1, M=0.5), versions=[ver("base", v1["B3"])]),
    "B4": dict(area="B", load=dict(B=1), versions=[ver("base", v1["B4"])]),
    "B5": dict(area="B", load=dict(B=1, M=0.75, W=0.25), versions=[ver("base", v1["B5"])]),
    # ---------------- wealth ----------------
    "W1": dict(area="W", load=dict(W=1, C=0.25), versions=[
        ver("sup", {**v1["W1"], **v1["W1"]["variants"]["sup"]}, dict(money=["sup"]), usd([4_800, 9_000, 15_000, 24_000, 39_000, 60_000], 4_000, 60_000), tier=["sup"] * 6, load=dict(W=1)),
        ver("hh", {**v1["W1"], **v1["W1"]["variants"]["hh"]}, dict(money=["hh"]), usd([18_000, 37_500, 62_500, 100_000, 162_500, 300_000], 15_000, 300_000), tier=["low", "low", "mid", "mid", "mid", "high"], load=dict(W=1)),
        new("owner", ("过去 12 个月，你个人从公司得到的税前收入是多少？工资、分红和提款合计。", "In the past 12 months, how much did you personally receive from your business before taxes? Count salary, dividends and drawings together."),
            [("低于 $30,000", "Under $30,000"), ("$30,000 至 $59,999", "$30,000 to $59,999"), ("$60,000 至 $99,999", "$60,000 to $99,999"), ("$100,000 至 $199,999", "$100,000 to $199,999"),
             ("$200,000 至 $499,999", "$200,000 to $499,999"), ("$500,000 至 $999,999", "$500,000 to $999,999"), ("$1,000,000 以上", "$1,000,000 or more")],
            dict(role=["owner"]), usd([20_000, 45_000, 80_000, 150_000, 350_000, 750_000, 1_500_000], 8_000, 1_500_000), tier=["low", "mid", "mid", "high", "high", "high", "high"]),
        new("free", ("过去 12 个月，扣除经营成本之后，你的税前净收入是多少？", "In the past 12 months, what was your net income before taxes, after business costs?"), BASE7, dict(role=["free"]), BASE7_S, tier=BASE7_TIER),
        new("ret", ("过去 12 个月，你个人的税前总收入是多少？退休金、社保和投资收益合计。", "What was your total personal income before taxes in the past 12 months? Count pensions, Social Security and investment income together."), BASE7, dict(role=["ret"]), BASE7_S, tier=BASE7_TIER, load=dict(W=1)),
        new("base", ("过去 12 个月，你个人的税前总收入是多少？工资、奖金等合计。", "What was your total personal income before taxes in the past 12 months? Count wages, bonuses and similar together."), BASE7, None, BASE7_S, tier=BASE7_TIER)]),
    "W2": dict(area="W", load=dict(W=1, M=0.25), versions=[
        w2("400s", "$400", dict(tier=["sup"]), 0.0, 1.0), w2("400", "$400", dict(tier=["low"]), 0.0, 0.8),
        w2("2000", "$2,000", dict(tier=["mid"]), 0.1, 0.9), w2("10000", "$10,000", dict(tier=["high"]), 0.2, 1.0)]),
    "W3": dict(area="W", load=dict(W=1, M=0.25), versions=[
        new("ret", ("按现在的开支水平，不算退休金和社保，你的存款和投资够用多少年？", "At your present level of spending, and leaving pensions and Social Security aside, how many years would your savings and investments last?"),
            [("不到 1 年", "Less than 1 year"), ("1 至 3 年", "1 to 3 years"), ("3 至 10 年", "3 to 10 years"), ("10 至 20 年", "10 to 20 years"), ("20 年以上", "More than 20 years")], dict(role=["ret"])),
        ver("sup", {**v1["W3"], **v1["W3"]["variants"]["sup"]}, dict(money=["sup", "hh"])),
        new("seek", ("按现在的开支，你的存款还能维持多久？", "At your present level of spending, how long will your savings last?"), v1["W3"]["opts"], dict(role=["seek"])),
        ver("base", v1["W3"])]),
    "W4": dict(area="W", load=dict(W=1), versions=[
        ver("stu", {**v1["W4"], **v1["W4"]["variants"]["stu"]}, dict(role=STUDENT), usd([None, 500, 3_000, 12_500, 35_000, 75_000], NW_LO, 75_000)),
        new("low", v1["W4"]["q"], [("负数", "Negative"), ("$0 至 $4,999", "$0 to $4,999"), ("$5,000 至 $19,999", "$5,000 to $19,999"), ("$20,000 至 $49,999", "$20,000 to $49,999"), ("$50,000 至 $149,999", "$50,000 to $149,999"), ("$150,000 以上", "$150,000 or more")],
            dict(tier=["sup", "low"]), usd([None, 2_500, 12_500, 35_000, 100_000, 225_000], NW_LO, NW_HI)),
        ver("mid", v1["W4"], dict(tier=["mid"]), usd([None, 5_000, 30_000, 100_000, 325_000, 750_000], NW_LO, NW_HI)),
        new("high", v1["W4"]["q"], [("低于 $100,000", "Under $100,000"), ("$100,000 至 $249,999", "$100,000 to $249,999"), ("$250,000 至 $499,999", "$250,000 to $499,999"), ("$500,000 至 $999,999", "$500,000 to $999,999"), ("$1,000,000 至 $4,999,999", "$1,000,000 to $4,999,999"), ("$5,000,000 以上", "$5,000,000 or more")],
            dict(tier=["high"]), usd([50_000, 175_000, 375_000, 750_000, 3_000_000, 7_500_000], NW_LO, NW_HI))]),
    "W5": dict(area="W", load=dict(W=1, M=0.25), versions=[
        new("ret", ("你每月的固定收入（退休金、社保、年金）能覆盖多大比例的日常开支？", "How much of your day-to-day spending does your regular monthly income (pension, Social Security, annuities) cover?"),
            [("不到一半", "Less than half"), ("一半左右", "About half"), ("大部分", "Most of it"), ("全部", "All of it"), ("全部，并且有结余", "All of it, with money left over")], dict(role=["ret"])),
        ver("loans", {**v1["W5"], **v1["W5"]["variants"]["stu"]}, dict(role=STUDENT)),
        new("save", ("过去 12 个月，你的税后收入里大约有多大比例存了下来或用于投资？", "In the past 12 months, about what share of your after-tax income did you save or invest?"),
            [("不到 5%", "Under 5%"), ("5% 至 9%", "5% to 9%"), ("10% 至 19%", "10% to 19%"), ("20% 至 34%", "20% to 34%"), ("35% 以上", "35% or more")], dict(tier=["high"]), [0.35, 0.5, 0.65, 0.8, 1.0]),
        new("hh", ("你家每月的收入里，大约有多大比例用来还债（房贷、车贷、信用卡、学生贷款）？", "About what share of your household's monthly income goes to debt payments (mortgage, car loan, credit cards, student loans)?"),
            v1["W5"]["opts"], dict(money=["hh"], tier=["low", "mid"]), [0.0, 0.2, 0.4, 0.6, 0.75]),
        new("debt", ("你每月的收入里，大约有多大比例用来还债（房贷、车贷、信用卡、学生贷款）？", "About what share of your monthly income goes to debt payments (mortgage, car loan, credit cards, student loans)?"),
            v1["W5"]["opts"], None, [0.0, 0.2, 0.4, 0.6, 0.75])]),
    "W6": dict(area="W", load=dict(W=0.75, M=0.75), versions=[
        new("ret", ("“我担心我现有的钱不够用到最后。”这句话在多大程度上符合你？", "\"I am concerned that the money I have will not last.\" How well does this describe you?"), AGREE, dict(role=["ret"])),
        new("high", ("你多久会觉得，是钱在左右你的生活？", "How often do you feel that your finances control your life?"),
            [("总是", "Always"), ("经常", "Often"), ("有时", "Sometimes"), ("很少", "Rarely"), ("从不", "Never")], dict(tier=["high"])),
        new("base", ("“我在经济上只是勉强维持。”这句话在多大程度上符合你？", "\"I am just getting by financially.\" How well does this describe you?"), AGREE)]),
    # ---------------- network ----------------
    "N1": dict(area="N", load=dict(N=1, W=0.25, C=0.25), versions=[
        new("stu", ("在你熟到可以请对方帮个小忙的人里，下面十类人覆盖了几类？教授或老师、已经工作的学长学姐、在你想进的行业里工作的人、创业者或企业主、公司里负责招聘的人、医生、律师、工程师或程序员、政府或公共部门的工作人员、博士生或科研人员。",
                    "Among people you know well enough to ask a small favour, how many of these ten kinds are covered? A professor or teacher, a graduate of your school who is now working, someone working in the industry you want to enter, a founder or business owner, someone who hires for a company, a doctor, a lawyer, an engineer or programmer, someone working in government or the public sector, a doctoral student or researcher."),
            N1_OPTS_STU, dict(role=STUDENT)),
        ver("base", v1["N1"])]),
    "N2": dict(area="N", load=dict(N=1, M=0.5, B=0.25), versions=[ver("base", v1["N2"])]),
    "N3": dict(area="N", load=dict(N=1, W=0.25, C=0.25), versions=[
        n3("stu", "推荐一份实习或工作；借给你 $500；帮你修改简历或准备面试；把你介绍给你想进的行业里的人",
           "recommend you for an internship or a job; lend you $500; help with your résumé or prepare you for an interview; introduce you to someone in the industry you want to enter", dict(role=STUDENT)),
        n3("biz", "介绍一位客户或投资人；在你周转困难时借给你 $25,000；提供法律或税务方面的专业意见；加入你的团队，或者把合适的人推荐给你",
           "introduce a client or an investor; lend you $25,000 in a cash squeeze; give you professional advice on law or tax; join your team, or recommend the right person for it", dict(role=["owner", "free"])),
        n3("ret", "在你生病时照顾你几天；借给你 $5,000；提供法律、医疗或理财方面的建议；开车送你去医院或机场",
           "look after you for a few days if you were ill; lend you $5,000; give you advice on law, health or money; drive you to a hospital or an airport", dict(role=["ret"])),
        n3("care", "临时替你照看家人几个小时；借给你 $1,000；提供法律或医疗方面的建议；在你想工作的时候给你介绍机会",
           "look after your family for a few hours at short notice; lend you $1,000; give you legal or medical advice; point you to an opening when you want to work", dict(role=["care", "oth"])),
        n3job("1000", "$1,000", dict(tier=["sup", "low"])), n3job("5000", "$5,000", dict(tier=["mid"])), n3job("25000", "$25,000", dict(tier=["high"]))]),
    "N4": dict(area="N", load=dict(N=1, M=0.25), versions=[ver("base", v1["N4"])]),
    "N5": dict(area="N", load=dict(N=1, C=0.25), versions=[
        new("ret", ("你现在有没有在指导或帮助比你年轻的人，例如带徒弟、辅导功课、给人做顾问或在社区里做志愿者？", "Do you now guide or help people younger than you, for example by training someone, tutoring, advising or volunteering in your community?"),
            [("没有", "No"), ("偶尔", "Occasionally"), ("每月有几次", "A few times a month"), ("每周都有", "Every week"), ("这是我现在生活的重要部分", "It is an important part of my life now")], dict(role=["ret"]), load=dict(N=1, M=0.25)),
        new("base", ("你有没有导师或顾问，也就是比你有经验、并且在学业或事业上实际帮助你的人？", "Do you have a mentor or an advisor: someone more experienced who actively helps your studies or career?"), v1["N5"]["opts"])]),
    "N6": dict(area="N", load=dict(N=0.75, M=0.75), versions=[ver("base", v1["N6"])]),
    # ---------------- capability ----------------
    "C_exp": dict(area="C", load=dict(C=1, N=0.25), versions=[ver("base", {**v1["S1"], **v1["S1"]["variants"]["stu"]})]),
    "C_lvl": dict(area="C", load=dict(C=1, W=0.5, N=0.25), versions=[ver("base", v1["S1"], mgr=[0, 0, 0, 1, 1])]),
    "C_stage": dict(area="C", load=dict(C=1, W=0.5, N=0.25), versions=[
        new("base", ("你的自由职业或个体经营现在处在什么阶段？", "What stage is your freelance work or your own practice at?"),
            [("刚起步，还没有稳定的收入", "Just starting, with no steady income yet"), ("有收入，但还不够生活", "Earning, but not enough to live on"), ("是我的主要收入，够我生活", "My main income, and enough to live on"),
             ("收入稳定，可以挑选项目或客户", "Steady income, and I can choose my projects or clients"), ("业务超出我一个人能接的量，已经开始外包或与人合作", "More work than I can take on alone, so I subcontract or work with partners")])]),
    "C_biz": dict(area="C", load=dict(C=1, W=0.5, N=0.25), versions=[
        new("base", ("你的公司现在处在什么阶段？", "What stage is your company at?"),
            [("还没有收入", "No revenue yet"), ("有收入，尚未盈利", "Revenue, not yet profitable"), ("盈亏基本平衡", "About breaking even"), ("稳定盈利", "Consistently profitable"), ("盈利并且在扩张（新市场、新产品或新一轮融资）", "Profitable and expanding (new markets, new products or a new round of funding)")])]),
    "C_last": dict(area="C", load=dict(C=1, W=0.25, N=0.25), versions=[
        new("ret", ("退休前，你的主要工作属于哪一类？", "Which best describes your main job before you retired?"), [("没有正式工作过", "I did not have a regular job")] + [(o[0], o[1]) for o in v1["S1"]["opts"]],
            dict(role=["ret"]), [0, 0.2, 0.4, 0.6, 0.8, 1.0]),
        new("base", ("你最近一份工作属于哪一类？", "Which best describes your most recent job?"), [("还没有工作过", "I have not had a job yet")] + [(o[0], o[1]) for o in v1["S1"]["opts"]], None, [0, 0.2, 0.4, 0.6, 0.8, 1.0])]),
    "C_mast": dict(area="C", load=dict(C=1, W=0.25), versions=[
        new("stu", ("在你的专业课里，你大致处在什么水平？", "Where do you stand in the courses of your subject?"),
            [("跟得比较吃力", "I struggle to keep up"), ("基本能跟上", "I keep up"), ("成绩中上", "Above the middle of the class"), ("名列前茅", "Near the top"), ("名列前茅，并且在竞赛、科研或作品上有成果", "Near the top, with results in competitions, research or a portfolio")],
            dict(role=["ug4", "cc"]), load=dict(C=1)),
        new("grad", ("在你的研究或专业方向上，你现在处在什么水平？", "Where do you stand in your area of research or professional study?"),
            [("刚入门，主要在上课", "Starting out, mainly taking courses"), ("能在指导下完成课题或案例", "I complete projects or cases under supervision"), ("能独立完成课题或项目", "I complete projects on my own"),
             ("有发表、获奖或被采用的成果", "I have work that was published, awarded or put to use"), ("在这个方向上有一定名气：受邀报告、审稿或合作", "Known in the area: invited to present, review or collaborate")], dict(role=["grad"]), load=dict(C=1)),
        new("ret", ("退休前，你在自己这一行里达到了什么水平？", "What level had you reached in your line of work before you retired?"), LEVELS, dict(role=["ret"]), load=dict(C=1)),
        new("base", ("在你的主要工作领域里，下面哪一项最符合你现在的水平？", "In your main field of work, which best describes your present level?"), [("刚入门，需要别人带着做", "Starting out: I need guidance from others")] + LEVELS[1:])]),
    "C_deg": dict(area="C", load=dict(C=1, W=0.25, N=0.25), versions=[ver("base", v1["E1"])]),
    "C_rec": dict(area="C", load=dict(C=1, N=0.25), versions=[ver("base", v1["E5"])]),
    "C_lic": dict(area="C", load=dict(C=1), versions=[
        new(f[0], (f"你持有几项需要通过考试才能取得的专业执照或证书（例如{f[3]}）？", f"How many professional licences or certifications do you hold that required an exam (for example {f[4]})?"),
            v1["E2"]["opts"], dict(field=[f[0]])) for f in FIELDS]),
    "C_learn": dict(area="C", load=dict(C=1, M=0.25), versions=[
        new("ret", ("过去 12 个月，你参加了大约多少小时的课程、讲座或培训？兴趣班和老年大学也算。", "In the past 12 months, about how many hours of courses, lectures or training did you attend? Hobby classes and lifelong-learning programmes count."), v1["E3"]["opts"], dict(role=["ret"])),
        new("stu", ("过去 12 个月，在必修课程之外，你完成了大约多少小时的系统学习（网课、培训、工作坊）？", "In the past 12 months, about how many hours of structured learning did you complete beyond your required courses (online courses, training, workshops)?"), v1["E3"]["opts"], dict(role=STUDENT)),
        new("plain", ("过去 12 个月，你完成了大约多少小时的系统学习（课程、培训、工作坊）？", "In the past 12 months, about how many hours of structured learning did you complete (courses, training, workshops)?"), v1["E3"]["opts"], dict(role=["seek", "care", "oth"])),
        new("base", ("过去 12 个月，在日常工作之外，你完成了大约多少小时的系统学习（课程、培训、工作坊）？", "In the past 12 months, about how many hours of structured learning did you complete beyond your day-to-day work (courses, training, workshops)?"), v1["E3"]["opts"])]),
    "C_lang": dict(area="C", load=dict(C=1, N=0.25), versions=[
        new("base", ("你能用几种语言流利地交流，达到可以用来工作或办事的程度？", "In how many languages can you communicate fluently, well enough to work or handle everyday business in them?"), v1["S2"]["opts"])]),
    "C_dig": dict(area="C", load=dict(C=1, W=0.25), versions=[ver("base", v1["S3"])]),
    "C_int": dict(area="C", load=dict(C=0.75, W=0.5), versions=[ver("base", v1["S4"], pin=[0])]),
    "C_paid": dict(area="C", load=dict(C=0.75, W=0.5, N=0.25), versions=[
        new("ret", ("过去 12 个月，有没有人为你的经验或技能付过钱（顾问、兼职、授课、手艺）？", "In the past 12 months, has anyone paid you for your experience or a skill (consulting, part-time work, teaching, a craft)?"),
            [("没有", "No"), ("一两次", "Once or twice"), ("一年有几次", "A few times a year"), ("每月都有", "Every month"), ("每周都有", "Every week")], dict(role=["ret"])),
        ver("job", v1["S6"], dict(role=STUDENT + ["emp", "gig"])),
        new("base", ("过去 12 个月，有没有人为你的某项技能付过钱（接活、家教、设计、编程、教练、手艺）？", "In the past 12 months, has anyone paid you for a skill (odd jobs, tutoring, design, coding, coaching, a craft)?"), v1["S6"]["opts"])]),
    "C_team": dict(area="C", load=dict(C=1, N=0.5), versions=[
        new("owner", ("除你自己以外，你的公司现在有多少人（全职和兼职都算）？", "Apart from you, how many people work in your company now, full-time and part-time?"), TEAM_OPTS, dict(role=["owner"])),
        new("emp", ("直接或间接向你汇报的有多少人？", "How many people report to you, directly or indirectly?"), TEAM_OPTS)]),
    "C_rep": dict(area="C", load=dict(C=0.75, N=0.5), versions=[
        new("base", ("你的客户或订单主要是怎么来的？", "Where do most of your clients or orders come from?"),
            [("还没有稳定的客户", "No steady clients yet"), ("主要靠平台或广告", "Mostly platforms or advertising"), ("主要靠熟人介绍", "Mostly introductions from people I know"),
             ("老客户的复购和转介绍占多数", "Mostly repeat business and referrals from clients"), ("客户主动找来，需要排期或挑选", "Clients come to me, and I schedule or choose among them")])]),
    "C_ext": dict(area="C", load=dict(C=0.75, N=0.5, W=0.25), versions=[
        new("base", ("过去 12 个月，有没有别的公司或机构请你担任顾问、董事、导师，或者请你去分享经验？", "In the past 12 months, has another company or organization asked you to act as an advisor, board member or mentor, or to speak about your experience?"),
            [("没有", "No"), ("一两次", "Once or twice"), ("经常有，没有报酬", "Regularly, unpaid"), ("经常有，有报酬", "Regularly, paid"), ("这是我收入的重要来源", "It is an important part of my income")])]),
    "C_pur": dict(area="C", load=dict(C=0.75, B=0.25, M=0.25, N=0.25), versions=[
        new("base", ("你在任何一项爱好上达到过的最高水平是什么（运动、音乐、美术、手工、棋类、烹饪、游戏）？", "What is the highest level you have reached in any pursuit of your own (a sport, music, art, craft, chess, cooking, a game)?"), v1["S7"]["opts"])]),
    # ---------------- mind: the same for everyone ----------------
    "M1": dict(area="M", load=dict(M=1, W=0.25, N=0.25, B=0.25), versions=[ver("base", v1["M1"])]),
    "M2": dict(area="M", load=dict(M=1, C=0.25), versions=[ver("base", v1["M2"])]),
    "M3": dict(area="M", load=dict(M=1, B=0.25), versions=[ver("base", v1["M3"])]),
    "M4": dict(area="M", load=dict(M=1, B=0.25), versions=[ver("base", v1["M4"])]),
    "M5": dict(area="M", load=dict(M=1, C=0.25), versions=[ver("base", v1["M5"])]),
    "M6": dict(area="M", load=dict(M=1, W=0.25), versions=[ver("base", v1["M6"])]),
    "G1": dict(area="G", load=dict(W=0.5, C=0.5, M=0.5, N=0.25), versions=[ver("base", v1["G1"])]),
}
for _it in ITEMS.values():                       # options that keep their place when the order is flipped
    for _v in _it["versions"]:
        _v.setdefault("pin", [k for k, s in enumerate(_v["s"]) if s is None])

ALT = ("alt", "mgr", 1, "C_team", "C_paid")              # managers are asked about their team, others about paid skills
NOWORK = lambda iid: ("skip", "nowork", 1, iid)          # left out for a job seeker who has not worked yet
C_STUDENT = ["C_exp", "C_mast", "C_rec", "C_learn", "C_paid", "C_lang", "C_dig", "C_int", "C_pur"]
C_EMPLOYEE = ["C_lvl", ALT, "C_mast", "C_deg", "C_lic", "C_learn", "C_lang", "C_dig", "C_int", "C_pur"]
C_FREE = ["C_stage", "C_rep", "C_mast", "C_deg", "C_lic", "C_learn", "C_lang", "C_dig", "C_int", "C_pur"]
C_OWNER = ["C_biz", "C_team", "C_rep", "C_ext", "C_mast", "C_learn", "C_lang", "C_dig", "C_int", "C_pur"]
C_SEEK = [NOWORK("C_last"), NOWORK("C_mast"), "C_deg", "C_lic", "C_learn", "C_paid", "C_lang", "C_dig", "C_int", "C_pur"]
C_HOME = ["C_last", "C_deg", "C_learn", "C_paid", "C_lang", "C_dig", "C_int", "C_pur"]
C_RET = ["C_last", "C_mast", "C_deg", "C_learn", "C_paid", "C_lang", "C_dig", "C_int", "C_pur"]
COMP_C = {"ug4": C_STUDENT, "cc": C_STUDENT, "grad": C_STUDENT, "emp": C_EMPLOYEE, "gig": C_EMPLOYEE, "free": C_FREE, "owner": C_OWNER,
          "seek": C_SEEK, "care": C_HOME, "oth": C_HOME, "ret": C_RET}
W_ALL = ["W1", "W2", "W3", "W4", "W5", "W6"]
N_ALL = ["N1", "N2", "N3", "N4", "N5", "N6"]
N_HOME = ["N1", "N2", "N3", "N4", "N6"]                  # no mentor question for carers and "other"
B_ALL = ["B1", "B2", "B3", "B4", "B5"]
M_ALL = ["M1", "M2", "M3", "M4", "M5", "M6"]


def slots(role):
    """The questions for a situation, block by block: capability, wealth, network, body, mind, ladder."""
    return COMP_C[role] + W_ALL + (N_HOME if role in ("care", "oth") else N_ALL) + B_ALL + M_ALL + ["G1"]


def pick(item_id, ctx):
    for v in ITEMS[item_id]["versions"]:
        if all(ctx.get(k) in allowed for k, allowed in v["when"].items()):
            return v
    raise ValueError(f"no version of {item_id} for {ctx}")


def resolve(slot, ctx):
    if isinstance(slot, tuple):
        if slot[0] == "skip":
            return None if ctx.get(slot[1]) == slot[2] else slot[3]
        return slot[3] if ctx.get(slot[1]) == slot[2] else slot[4]
    return slot


def count(ctx):
    return sum(1 for s in slots(ctx["role"]) if not (isinstance(s, tuple) and s[0] == "skip" and ctx.get(s[1]) == s[2]))


def run(ctx, answer):
    """Walk the questionnaire. answer(item_id, version) returns the option index.
    Returns the list of (item_id, version, option index) and the final context."""
    ctx = dict(ctx)
    out = []
    for slot in slots(ctx["role"]):
        iid = resolve(slot, ctx)
        if iid is None:
            continue
        v = pick(iid, ctx)
        k = answer(iid, v)
        out.append((iid, v, k))
        if "tier" in v:
            ctx["tier"] = v["tier"][k]
        if "mgr" in v:
            ctx["mgr"] = v["mgr"][k]
    return out, ctx


# ---------------- response time ----------------
# An answer counts in full unless it comes faster than a person could glance at the stem.
GLANCE_EN = 1400 / 60     # words a second
GLANCE_ZH = 2200 / 60     # characters a second
T_MIN, T_MAX, FLOOR = 0.6, 2.0, 0.5


def read_units(text, lang):
    if lang == "en":
        return len(text.split())
    return len(re.findall(r"[一-鿿]", text)) + len(re.findall(r"[A-Za-z0-9$,.%]+", text))


def threshold(version, lang):
    i = 0 if lang == "zh" else 1
    return max(T_MIN, min(T_MAX, read_units(version["q"][i], lang) / (GLANCE_ZH if lang == "zh" else GLANCE_EN)))


def multiplier(seconds, thr):
    if seconds is None:
        return 1.0
    return max(FLOOR, min(1.0, seconds / thr))


# ---------------- scoring ----------------
def score(answers, mult=None, median=None):
    """answers: list of (item_id, version, option index). Returns for every area the raw score
    after the discount for time, the raw score at full weight, and the share of weight kept."""
    mult = mult or {}
    median = median or {a: 0.5 for a in AREAS}
    out = {}
    for a in AREAS:
        on = od = of = fo = sn = sd = sf = fs = 0.0
        own_n = own_all = 0
        for iid, v, k in answers:
            w = (v.get("load") or ITEMS[iid]["load"]).get(a)
            if not w:
                continue
            own = ITEMS[iid]["area"] == a
            own_all += own
            s = v["s"][k]
            if s is None:
                continue
            d = mult.get(iid, 1.0)
            if own:
                on += w * d * s; od += w * d; of += w; fo += w * s; own_n += 1
            else:
                sn += w * d * s; sd += w * d; sf += w; fs += w * s
        if not od or own_n / own_all < 0.6:
            out[a] = None
            continue
        raw = 2 / 3 * on / od + 1 / 3 * sn / sd if sd else on / od
        full = 2 / 3 * fo / of + 1 / 3 * fs / sf if sf else fo / of
        keep = 2 / 3 * od / of + 1 / 3 * sd / sf if sd else od / of
        out[a] = dict(raw=keep * raw + (1 - keep) * median[a], full=full, keep=keep)
    return out


def price(raw, m=0.5, sd=0.2):
    return max(55.0, min(145.0, 100 + 15 * (raw - m) / sd))


# ---------------- audit of every path ----------------
def contexts():
    for r in ROLES:
        ids = [q["id"] for q in EXTRA[r[0]]]
        for m in (["own", "sup", "hh"] if "money" in ids else ["own"]):
            for f in ([x[0] for x in FIELDS] if "field" in ids else [None]):
                for nw in ([0, 1] if "exp" in ids else [0]):
                    yield dict(role=r[0], money=m, field=f, nowork=nw, tier=None, mgr=0)


def audit():
    """Walk every situation with every income answer and both kinds of employee. Returns the
    number of situations, the number of distinct questionnaires and a list of problems."""
    paths, problems, n = set(), [], 0
    for c in contexts():
        n += 1
        w1 = pick("W1", c)
        for k1 in range(len(w1["opts"])):
            for lvl in ([0, 4] if c["role"] in ("emp", "gig") else [0]):
                ans, ctx = run(c, lambda iid, v: k1 if iid == "W1" else lvl if iid == "C_lvl" else 0)
                kd = {a[0]: a[1]["key"] for a in ans}
                paths.add(tuple(kd.items()))
                tag = f"{c['role']}/{c['money']}/{c['field']}/nw{c['nowork']} W1={k1} lvl={lvl}"
                role, high = c["role"], ctx["tier"] == "high"
                bad = []
                if len(ans) != count(ctx) or len(kd) != len(ans): bad.append("count")
                if role in STUDENT and (kd["N1"] != "stu" or kd["N3"] != "stu" or kd["C_mast"] not in ("stu", "grad") or {"C_lvl", "C_lic", "C_deg", "C_last"} & set(kd) or kd["W4"] != "stu"): bad.append("student")
                if role == "ret" and not all(kd[i] == "ret" for i in ("N3", "N5", "W1" if c["money"] == "own" else "N5", "W3", "W5", "W6", "C_mast", "C_last", "C_learn", "C_paid")): bad.append("retiree")
                if role == "ret" and "C_lic" in kd: bad.append("retiree licence")
                if role in ("care", "oth") and {"N5", "C_mast", "C_lic"} & set(kd): bad.append("carer")
                if role == "owner" and {"C_deg", "C_rec", "C_lic"} & set(kd): bad.append("owner credential")
                if role != "ret" and high and (kd["W5"] not in ("save", "loans") or kd["W2"] != "10000" or kd["W6"] != "high"): bad.append("high tier")
                if role not in STUDENT and kd["W5"] == "loans": bad.append("loans")
                if role not in STUDENT and kd["N1"] == "stu": bad.append("student N1")
                if c["nowork"] and {"C_last", "C_mast"} & set(kd): bad.append("no work")
                for iid, v, _ in ans:
                    if len(v["s"]) != len(v["opts"]) or not all(v["q"]) or not all(all(o) for o in v["opts"]): bad.append(f"{iid} incomplete")
                    vals = [x for x in v["s"] if x is not None]
                    if min(vals) < 0 or max(vals) > 1 + 1e-9: bad.append(f"{iid}:{v['key']} score out of range")
                problems += [f"{tag}: {b}" for b in bad]
    return n, len(paths), problems


def extremes():
    """Price for each situation when every answer is the best, the middle or the worst."""
    rows = []
    for r in ROLES:
        c = next(x for x in contexts() if x["role"] == r[0] and x["money"] == ("sup" if r[0] in STUDENT else "own"))
        row = [r[0], count(c)]
        for how in ("best", "mid", "worst"):
            def choose(iid, v):
                order = sorted((k for k, s in enumerate(v["s"]) if s is not None), key=lambda k: v["s"][k])
                return order[-1] if how == "best" else order[0] if how == "worst" else order[len(order) // 2]
            ans, _ = run(c, choose)
            sc = score(ans)
            row.append(sum(price(sc[a]["raw"]) for a in AREAS) / len(AREAS))
        rows.append(row)
    return rows


if __name__ == "__main__":
    n, paths, problems = audit()
    print("situations walked:", n, "| distinct questionnaires:", paths, "| versions:", sum(len(i["versions"]) for i in ITEMS.values()), "over", len(ITEMS), "items")
    print("problems:", len(problems)); [print(" ", x) for x in sorted(set(p.split(": ", 1)[1] for p in problems))[:20]]
    print("role  questions  best   mid   worst")
    for row in extremes():
        print(f"{row[0]:6s} {row[1]:5d} {row[2]:8.1f} {row[3]:6.1f} {row[4]:6.1f}")
    for lang in ("zh", "en"):
        ths = sorted(threshold(v, lang) for i in ITEMS.values() for v in i["versions"])
        print(lang, "thresholds s: min", ths[0], "median", round(ths[len(ths) // 2], 2), "max", ths[-1])
