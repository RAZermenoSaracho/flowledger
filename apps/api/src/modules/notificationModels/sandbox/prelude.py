import ast as _ast
import re as _re
import unicodedata as _unicodedata
import datetime as _datetime
import decimal as _decimal
import sys as _sys

MAX_CODE = 20000
MAX_PRINT = 4096
_BAD_ATTR = _re.compile(r"^(gi|cr|ag|f|tb|co)_|^(format|format_map|mro)$")
_BAD_NODES = (
    _ast.Import, _ast.ImportFrom, _ast.ClassDef, _ast.Global, _ast.Nonlocal,
    _ast.With, _ast.AsyncWith, _ast.AsyncFunctionDef, _ast.AsyncFor,
    _ast.Await, _ast.Yield, _ast.YieldFrom, _ast.GeneratorExp, _ast.Match,
)
_LABEL = {
    _ast.Import: "import", _ast.ImportFrom: "import", _ast.ClassDef: "class definitions",
    _ast.Global: "global", _ast.Nonlocal: "nonlocal", _ast.With: "with",
    _ast.AsyncWith: "async with", _ast.AsyncFunctionDef: "async functions",
    _ast.AsyncFor: "async for", _ast.Await: "await", _ast.Yield: "yield",
    _ast.YieldFrom: "yield", _ast.GeneratorExp: "generator expressions", _ast.Match: "match",
}


def _err(node, msg):
    return {"line": getattr(node, "lineno", 1), "col": getattr(node, "col_offset", 0), "message": msg}


def validate(code):
    if not isinstance(code, str):
        return [{"line": 1, "col": 0, "message": "code must be a string"}]
    if len(code) > MAX_CODE:
        return [{"line": 1, "col": 0, "message": "code exceeds %d characters" % MAX_CODE}]
    try:
        tree = _ast.parse(code, "<script>")
    except SyntaxError as e:
        return [{"line": e.lineno or 1, "col": (e.offset or 1) - 1, "message": "SyntaxError: %s" % e.msg}]
    except (ValueError, RecursionError, MemoryError) as e:
        return [{"line": 1, "col": 0, "message": "invalid code: %s" % type(e).__name__}]
    errors = []
    for node in _ast.walk(tree):
        if isinstance(node, _BAD_NODES):
            errors.append(_err(node, "%s is not allowed" % _LABEL[type(node)]))
        if isinstance(node, (_ast.FunctionDef, _ast.Lambda)) and getattr(node, "decorator_list", None):
            errors.append(_err(node.decorator_list[0], "decorators are not allowed"))
        if isinstance(node, _ast.Name) and node.id.startswith("_"):
            errors.append(_err(node, "names starting with '_' are not allowed"))
        if isinstance(node, _ast.Attribute):
            if node.attr.startswith("_") or _BAD_ATTR.match(node.attr):
                errors.append(_err(node, "attribute '%s' is not allowed" % node.attr))
        if isinstance(node, _ast.arg) and node.arg.startswith("_"):
            errors.append(_err(node, "argument names starting with '_' are not allowed"))
        if isinstance(node, _ast.keyword) and node.arg and node.arg.startswith("_"):
            errors.append(_err(node, "keyword names starting with '_' are not allowed"))
        if isinstance(node, _ast.ExceptHandler) and node.name and node.name.startswith("_"):
            errors.append(_err(node, "names starting with '_' are not allowed"))
    # Disallow a user-defined `process` that is async/decorated is covered above.
    return errors


class _Out:
    __slots__ = ("kind", "data")

    def __init__(self, kind, data):
        self.kind = kind
        self.data = data


def _proposal(kind, **fields):
    return _Out(kind, dict((k, v) for k, v in fields.items() if v is not None))


def expense(amount, name, account=None, category=None, group=None, date=None, currency=None, notes=None):
    return _proposal("expense", amount=amount, name=name, account=account, category=category,
                     group=group, date=date, currency=currency, notes=notes)


def income(amount, name, account=None, category=None, group=None, date=None, currency=None, notes=None):
    return _proposal("income", amount=amount, name=name, account=account, category=category,
                     group=group, date=date, currency=currency, notes=notes)


def transfer(amount, name, account, to_account, date=None, currency=None, destination_amount=None, notes=None):
    return _proposal("transfer", amount=amount, name=name, account=account, to_account=to_account,
                     date=date, currency=currency, destination_amount=destination_amount, notes=notes)


def skip(reason):
    return _Out("skip", {"reason": str(reason)[:200]})


_NUM = _re.compile(r"-?\d[\d.,\s]*")


def amount(s, decimal=".", thousands=","):
    m = _NUM.search(s)
    if not m:
        raise ValueError("no amount found")
    raw = m.group(0).strip()
    neg = raw.startswith("-")
    raw = raw.lstrip("-").replace(thousands, "").replace(" ", "")
    if decimal != ".":
        raw = raw.replace(decimal, ".")
    raw = raw.rstrip(".")
    try:
        d = _decimal.Decimal(raw)
    except _decimal.InvalidOperation:
        raise ValueError("no amount found")
    return ("-" if neg else "") + format(d, "f")


def normalize(s):
    s = _unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not _unicodedata.combining(c))
    return " ".join(s.lower().split())


def parse_date(s, fmt):
    d = _datetime.datetime.strptime(s, fmt)
    return d.isoformat() if ("%H" in fmt or "%I" in fmt) else d.date().isoformat()


class _Namespace:
    pass


def _make_re():
    ns = _Namespace()
    for n in ("search", "match", "fullmatch", "findall", "finditer", "sub", "split", "compile", "escape"):
        setattr(ns, n, getattr(_re, n))
    for n in ("I", "IGNORECASE", "M", "MULTILINE", "S", "DOTALL"):
        setattr(ns, n, getattr(_re, n))
    return ns


class _Ctx:
    def __init__(self, received_at, settings):
        self.received_at = received_at
        self.settings = settings


_ALLOWED = ("abs all any bool dict enumerate float int isinstance len list max min range "
            "reversed round set sorted str sum tuple zip Exception ValueError").split()
_SAFE = {}
_BUILTINS_SRC = __builtins__ if isinstance(__builtins__, dict) else vars(__builtins__)
for _n in _ALLOWED:
    _SAFE[_n] = _BUILTINS_SRC[_n]
_SAFE.update({"True": True, "False": False, "None": None})

_STDOUT = []
_STDOUT_LEN = [0]


def _print(*args, sep=" ", end="\n"):
    s = (sep if sep is not None else " ").join(str(a) for a in args) + (end if end is not None else "\n")
    room = MAX_PRINT - _STDOUT_LEN[0]
    if room > 0:
        s = s[:room]
        _STDOUT.append(s)
        _STDOUT_LEN[0] += len(s)


def _error_line(exc):
    line = None
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == "<script>":
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def run(code, text, ctx):
    del _STDOUT[:]
    _STDOUT_LEN[0] = 0
    errors = validate(code)
    if errors:
        e = errors[0]
        return {"kind": "error", "error": {"message": "validation: " + e["message"], "line": e["line"]}, "stdout": ""}
    builtins = dict(_SAFE)
    builtins.update({
        "print": _print, "expense": expense, "income": income, "transfer": transfer,
        "skip": skip, "amount": amount, "normalize": normalize, "parse_date": parse_date,
        "Decimal": _decimal.Decimal, "re": _make_re(),
    })
    g = {"__builtins__": builtins}
    out = lambda r: dict(r, stdout="".join(_STDOUT))
    try:
        exec(compile(code, "<script>", "exec"), g)
        fn = g.get("process")
        if not callable(fn):
            return out({"kind": "error", "error": {"message": "process(text, ctx) is not defined"}})
        result = fn(text, _Ctx(ctx.get("received_at"), ctx.get("settings") or {}))
    except MemoryError:
        return out({"kind": "error", "error": {"message": "resource_limit"}})
    except BaseException as e:
        msg = "%s: %s" % (type(e).__name__, e)
        return out({"kind": "error", "error": {"message": msg[:500], "line": _error_line(e)}})
    if result is None:
        return out({"kind": "skip", "reason": "no result"})
    if not isinstance(result, _Out):
        return out({"kind": "error", "error": {"message": "invalid result"}})
    if result.kind == "skip":
        return out({"kind": "skip", "reason": result.data["reason"]})
    d = dict(result.data)
    d["kind"] = result.kind
    for k in ("amount", "destination_amount"):
        if k in d:
            if isinstance(d[k], _decimal.Decimal):
                d[k] = format(d[k], "f")
            elif not isinstance(d[k], str):
                return out({"kind": "error", "error": {"message": "invalid result"}})
    for k, v in d.items():
        if not isinstance(v, str):
            return out({"kind": "error", "error": {"message": "invalid result"}})
    return out({"kind": "proposal", "proposal": d})


_ACTION_KEYS = {
    "expense": ("amount", "name", "account", "category", "group", "currency", "date", "notes"),
    "income": ("amount", "name", "account", "category", "group", "currency", "date", "notes"),
    "transfer": ("amount", "name", "account", "to_account", "currency", "date", "notes"),
}
_SLOT_KEYS = ("account", "to_account", "category", "group")


def parse(code):
    """Maps canonical visual-rules code (design section 13) to rules JSON without executing it.

    Returns {"errors": [...]} for validation failures, {"unsupported": [{line, message}]} for any
    construct outside the canonical shape, else {"rules": {...}}.
    """
    errors = validate(code)
    if errors:
        return {"errors": errors}
    tree = _ast.parse(code, "<script>")
    lines = code.split("\n")
    bad = []

    def no(node, msg):
        bad.append({"line": getattr(node, "lineno", 1), "message": msg})

    def is_name(n, name):
        return isinstance(n, _ast.Name) and n.id == name

    def is_str(n):
        return isinstance(n, _ast.Constant) and isinstance(n.value, str)

    def lit(n, what):
        if is_str(n):
            return n.value
        no(n, "%s must be a plain string literal" % what)
        return None

    def re_call(n, what):
        """re.search/re.match(pattern, t[, re.I | flags=re.I]) -> (pattern, method, ignoreCase) or None."""
        if not (isinstance(n, _ast.Call) and isinstance(n.func, _ast.Attribute) and is_name(n.func.value, "re")
                and n.func.attr in ("search", "match")):
            no(n, "%s must be re.search(...) or re.match(...)" % what)
            return None
        pos = list(n.args)
        flags = None
        for k in n.keywords:
            if k.arg == "flags" and flags is None and len(pos) == 2:
                flags = k.value
            else:
                no(k.value, "unsupported argument in re.%s" % n.func.attr)
                return None
        if len(pos) == 3 and flags is None:
            flags = pos.pop()
        if len(pos) != 2 or not is_name(pos[1], "t"):
            no(n, "re.%s must be called as re.%s(<pattern>, t[, re.I])" % (n.func.attr, n.func.attr))
            return None
        ic = False
        if flags is not None:
            if (isinstance(flags, _ast.Attribute) and is_name(flags.value, "re") and flags.attr in ("I", "IGNORECASE")):
                ic = True
            else:
                no(flags, "only re.I / re.IGNORECASE flags are supported")
                return None
        pattern = lit(pos[0], "pattern")
        return None if pattern is None else (pattern, n.func.attr, ic)

    def term(n):
        if isinstance(n, _ast.UnaryOp) and isinstance(n.op, _ast.Not):
            r = re_call(n.operand, "negated condition")
            return None if r is None else {"kind": "not_matches", "pattern": r[0], "method": r[1], "ignoreCase": r[2]}
        if isinstance(n, _ast.Call):
            r = re_call(n, "condition")
            return None if r is None else {"kind": "matches", "pattern": r[0], "method": r[1], "ignoreCase": r[2]}
        if (isinstance(n, _ast.Compare) and len(n.ops) == 1 and isinstance(n.ops[0], (_ast.In, _ast.NotIn))
                and is_str(n.left)):
            kind = "contains" if isinstance(n.ops[0], _ast.In) else "not_contains"
            right = n.comparators[0]
            if is_name(right, "t"):
                return {"kind": kind, "text": n.left.value, "ignoreCase": False}
            if (isinstance(right, _ast.Call) and not right.args and not right.keywords
                    and isinstance(right.func, _ast.Attribute) and right.func.attr == "lower"
                    and is_name(right.func.value, "t")):
                if n.left.value != n.left.value.lower():
                    no(n, "text compared with t.lower() must be lower-case")
                    return None
                return {"kind": kind, "text": n.left.value, "ignoreCase": True}
        no(n, "unsupported condition; use '\"text\" in t', '\"text\" in t.lower()', or re.search/re.match on t")
        return None

    def conditions(test):
        if isinstance(test, _ast.BoolOp):
            match = "all" if isinstance(test.op, _ast.And) else "any"
            conds = [term(v) for v in test.values]
        else:
            match, conds = "all", [term(test)]
        return match, conds

    def group_ref(n):
        if (isinstance(n, _ast.Call) and isinstance(n.func, _ast.Attribute) and n.func.attr == "group"
                and is_name(n.func.value, "m") and len(n.args) == 1 and not n.keywords
                and isinstance(n.args[0], _ast.Constant) and type(n.args[0].value) is int and n.args[0].value >= 0):
            return n.args[0].value
        return None

    def value(n, what, is_amount):
        g = group_ref(n)
        if g is not None and not is_amount:
            return {"group": g}
        if is_amount and isinstance(n, _ast.Call) and is_name(n.func, "amount") and len(n.args) == 1 and not n.keywords:
            g = group_ref(n.args[0])
            if g is not None:
                return {"group": g}
        if is_str(n):
            return {"fixed": n.value}
        no(n, "%s must be a string literal%s" % (what, " or amount(m.group(n))" if is_amount else " or m.group(n)"))
        return None

    def action(call):
        if not (isinstance(call, _ast.Call) and isinstance(call.func, _ast.Name)):
            no(call, "expected return skip(...), expense(...), income(...) or transfer(...)")
            return None
        fn = call.func.id
        if fn == "skip":
            if len(call.args) == 1 and not call.keywords and is_str(call.args[0]):
                return {"kind": "skip", "reason": call.args[0].value}
            no(call, "skip takes one string literal reason")
            return None
        if fn not in _ACTION_KEYS:
            no(call, "'%s' is not supported; use skip, expense, income or transfer" % fn)
            return None
        if call.args:
            no(call, "%s must use keyword arguments" % fn)
            return None
        out = {"kind": fn}
        ok = True
        for k in call.keywords:
            if k.arg is None or k.arg not in _ACTION_KEYS[fn]:
                no(k.value, "argument '%s' is not supported for %s" % (k.arg, fn))
                ok = False
            elif k.arg in out:
                no(k.value, "duplicate argument '%s'" % k.arg)
                ok = False
            elif k.arg in _SLOT_KEYS:
                v = lit(k.value, k.arg)
                ok = ok and v is not None
                if v is not None:
                    out[k.arg] = v
            elif k.arg == "date":
                v = k.value
                g = group_ref(v.args[0]) if (isinstance(v, _ast.Call) and is_name(v.func, "parse_date")
                                             and len(v.args) == 2 and not v.keywords) else None
                if g is None or not is_str(v.args[1]):
                    no(v, 'date must be parse_date(m.group(n), "format")')
                    ok = False
                else:
                    out["date"] = {"group": g, "format": v.args[1].value}
            else:
                v = value(k.value, k.arg, k.arg == "amount")
                ok = ok and v is not None
                if v is not None:
                    out[k.arg] = v
        return out if ok else None

    def body(stmts, first):
        """[m = re.search(...); if not m: return skip(...)]? then return <action>."""
        extract = None
        rest = list(stmts)
        if (rest and isinstance(rest[0], _ast.Assign) and len(rest[0].targets) == 1 and is_name(rest[0].targets[0], "m")):
            r = re_call(rest[0].value, "extract")
            chk = rest[1] if len(rest) > 1 else None
            reason = None
            if not (isinstance(chk, _ast.If) and not chk.orelse and isinstance(chk.test, _ast.UnaryOp)
                    and isinstance(chk.test.op, _ast.Not) and is_name(chk.test.operand, "m")
                    and len(chk.body) == 1 and isinstance(chk.body[0], _ast.Return)):
                no(rest[0], "an extract must be followed by 'if not m: return skip(\"...\")'")
            else:
                a = action(chk.body[0].value)
                if a is None or a["kind"] != "skip":
                    no(chk, "the 'if not m' branch must be return skip(\"...\")")
                else:
                    reason = a["reason"]
            if r is not None and reason is not None:
                extract = {"pattern": r[0], "method": r[1], "ignoreCase": r[2], "missingReason": reason}
            rest = rest[2:]
        act = None
        if len(rest) == 1 and isinstance(rest[0], _ast.Return) and rest[0].value is not None:
            act = action(rest[0].value)
        else:
            no(rest[0] if rest else first, "a rule must end with a single return statement")
        for s in rest[1:]:
            no(s, "unsupported statement after the rule's return")
        if extract is None and act is not None:
            if any(is_name(x, "m") for x in _ast.walk(rest[0])):
                no(rest[0], "m.group(...) requires a preceding m = re.search(...) extract")
                return None
        if act is None:
            return None
        rule = {"action": act}
        if extract is not None:
            rule["extract"] = extract
        return rule

    def label_for(stmt):
        n = stmt.lineno
        if n >= 2:
            s = lines[n - 2].strip()
            if s.startswith("#") and s[1:].strip():
                return s[1:].strip()
        return None

    fns = [s for s in tree.body if isinstance(s, _ast.FunctionDef)]
    for s in tree.body:
        if s not in fns:
            no(s, "only the process function is supported at the top level")
    if len(fns) != 1:
        if len(fns) > 1:
            no(fns[1], "only one function is supported")
        elif not bad:
            no(tree, "process(text, ctx) is not defined")
        return {"unsupported": bad}
    fn = fns[0]
    a = fn.args
    if (fn.name != "process" or [x.arg for x in a.args] != ["text", "ctx"] or a.vararg or a.kwarg or a.kwonlyargs
            or a.defaults or a.posonlyargs or fn.returns is not None):
        no(fn, "the function must be exactly def process(text, ctx):")
        return {"unsupported": bad}
    stmts = list(fn.body)
    normalize_flag = None
    first = stmts[0]
    if (isinstance(first, _ast.Assign) and len(first.targets) == 1 and is_name(first.targets[0], "t")):
        v = first.value
        if isinstance(v, _ast.Call) and is_name(v.func, "normalize") and len(v.args) == 1 and not v.keywords and is_name(v.args[0], "text"):
            normalize_flag = True
        elif is_name(v, "text"):
            normalize_flag = False
    if normalize_flag is None:
        no(first, "the first statement must be t = normalize(text) or t = text")
    if isinstance(first, _ast.Assign):
        stmts = stmts[1:]
    fallback = None
    last = stmts[-1] if stmts else None
    if isinstance(last, _ast.Return) and last.value is not None:
        fb = action(last.value) if (isinstance(last.value, _ast.Call) and is_name(last.value.func, "skip")) else None
        if fb is not None:
            fallback = fb["reason"]
            stmts = stmts[:-1]
    if fallback is None:
        no(last or fn, "the script must end with return skip(\"<reason>\")")
    rules = []
    i = 0
    while i < len(stmts):
        s = stmts[i]
        if isinstance(s, _ast.If):
            if s.orelse:
                bad.append({"line": s.orelse[0].lineno, "message": "else / elif is not supported"})
            match, conds = conditions(s.test)
            r = body(s.body, s)
            if r is not None and all(c is not None for c in conds):
                r["match"], r["conditions"] = match, conds
            else:
                r = None
            i += 1
        elif isinstance(s, (_ast.Assign, _ast.Return)):
            r = body(stmts[i:], s)
            if r is not None:
                r["match"], r["conditions"] = "all", []
            i = len(stmts)
        else:
            no(s, "loops are not supported" if isinstance(s, (_ast.For, _ast.While))
               else "%s statements are not supported" % type(s).__name__)
            i += 1
            continue
        if r is not None:
            lab = label_for(s)
            if lab is not None:
                r["label"] = lab
            rules.append(r)
    if not bad and not rules:
        no(fn, "at least one rule is required")
    if bad:
        return {"unsupported": sorted(bad, key=lambda e: e["line"])}
    return {"rules": {"normalize": normalize_flag, "rules": rules, "fallbackReason": fallback}}
