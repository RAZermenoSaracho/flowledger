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
