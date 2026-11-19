"""Harness of differential.test.ts: scores sessions with reference/python/items2.py.

Reads a JSON list of sessions on stdin and writes a JSON list of results on stdout. Each
session is {role, background, langs, ks, secs}: the option index, the language and the seconds
of every answer in order. The questionnaire path is walked by items2.run, so a session whose
answers do not fit the path items2 takes is reported with an "error" field.

Usage: python3 py_driver.py <path to reference/python>
"""
import json
import sys

sys.path.insert(0, sys.argv[1])
import items2  # noqa: E402


def run_one(session):
    ctx = items2.context(session["role"], session["background"])
    ks, langs, secs = session["ks"], session["langs"], session["secs"]
    cursor = {"i": 0}

    def answer(iid, version):
        i = cursor["i"]
        if i >= len(ks):
            raise IndexError("more questions than answers at %s" % iid)
        if ks[i] >= len(version["opts"]):
            raise IndexError("option %d out of range at %s:%s" % (ks[i], iid, version["key"]))
        cursor["i"] = i + 1
        return ks[i]

    answers, final = items2.run(ctx, answer)
    if cursor["i"] != len(ks):
        raise IndexError("%d answers left over" % (len(ks) - cursor["i"]))
    thresholds, multipliers, mult = [], [], {}
    for i, (iid, version, _k) in enumerate(answers):
        thr = items2.threshold(version, langs[i])
        m = items2.multiplier(secs[i], thr)
        thresholds.append(thr)
        multipliers.append(m)
        mult[iid] = m
    scored = items2.score(answers, mult)
    areas = {}
    for a in items2.AREAS:
        s = scored[a]
        areas[a] = None if s is None else dict(
            raw=s["raw"], full=s["full"], keep=s["keep"], price=items2.price(s["raw"]), priceFull=items2.price(s["full"]))
    return dict(path=[[iid, v["key"]] for iid, v, _ in answers], context=final, count=items2.count(final),
                thresholds=thresholds, multipliers=multipliers, areas=areas)


def main():
    out = []
    for session in json.load(sys.stdin):
        try:
            out.append(run_one(session))
        except Exception as e:  # reported to the test, which fails on it
            out.append(dict(error="%s: %s" % (type(e).__name__, e)))
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
