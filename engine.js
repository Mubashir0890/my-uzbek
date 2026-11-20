(function () {
  const SP = "\u202f", U = "\u02BB";
  const ERR = {
    bad: "Ifoda xato. Qavslar va amallarni tekshiring.",
    zero: "Nolga bo" + U + "lib bo" + U + "lmaydi.",
    big: "Natija juda katta yoki aniqlanmagan.",
    root: "Manfiy sondan ildiz olib bo" + U + "lmaydi.",
    fact: "Faktorial 0 dan 170 gacha butun son uchun ishlaydi.",
    log: "Logarifm faqat musbat son uchun.",
    end: "Ifoda tugallanmagan.",
    int: "Bu yerda butun son kiriting.",
    pos: "O" + U + "lchamlar musbat bo" + U + "lishi kerak."
  };

  function fmt(v) {
    let s = String(parseFloat(v.toPrecision(12)));
    if (/e/i.test(s)) return s.replace(".", ",").replace("e+", "\u00B710^").replace("e", "\u00B710^");
    let [i, f] = s.split(".");
    const neg = i[0] === "-"; if (neg) i = i.slice(1);
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, SP);
    return (neg ? "\u2212" : "") + i + (f ? "," + f : "");
  }
  const R = v => fmt(Math.round(v * 1e6) / 1e6);
  const P = x => x < 0 ? "(" + fmt(x) + ")" : fmt(x);

  /* ---------- Ifoda hisoblagich ---------- */
  const MAP = { "+": "+", "-": "-", "\u2212": "-", "\u2013": "-", "*": "*", "\u00D7": "*", "/": "/", "\u00F7": "/", ":": "/", "^": "^", "(": "(", ")": ")", "%": "%", "!": "!", "\u221A": "\u221A" };
  const FN = ["sin", "cos", "tan", "log", "ln", "abs"];

  function tokenize(s) {
    s = s.replace(/\s+/g, "");
    const t = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/[0-9.,]/.test(c)) {
        let j = i; while (j < s.length && /[0-9.,]/.test(s[j])) j++;
        const n = parseFloat(s.slice(i, j).replace(",", "."));
        if (isNaN(n)) throw new Error(ERR.bad);
        t.push({ k: "n", v: n }); i = j; continue;
      }
      if (/[a-zA-Z\u03C0]/.test(c)) {
        let j = i; while (j < s.length && /[a-zA-Z\u03C0]/.test(s[j])) j++;
        const w = s.slice(i, j).toLowerCase(); i = j;
        if (w === "sqrt") t.push({ k: "\u221A" });
        else if (FN.includes(w)) t.push({ k: "fn", name: w });
        else if (w === "pi" || w === "\u03C0") t.push({ k: "c", v: Math.PI });
        else if (w === "e") t.push({ k: "c", v: Math.E });
        else if (w === "mod") t.push({ k: "mod" });
        else if (w === "x") t.push({ k: "*" });
        else throw new Error("Notanish belgi: " + w);
        continue;
      }
      if (!MAP[c]) throw new Error("Notanish belgi: " + c);
      t.push({ k: MAP[c] }); i++;
    }
    if (!t.length) throw new Error(ERR.bad);
    return t;
  }

  function parse(t) {
    let p = 0;
    const pk = () => t[p] && t[p].k, nx = () => t[p++];
    function expr() {
      let l = term();
      while (pk() === "+" || pk() === "-") {
        const o = nx().k, r = term();
        if (r.t === "f" && r.o === "%" && r.c.t === "n") l = { t: "b", o, l, r: { t: "n", v: r.c.v, pct: true } };
        else l = { t: "b", o, l, r };
      }
      return l;
    }
    function term() {
      let l = unary();
      while (["*", "/", "mod", "(", "\u221A", "fn", "c"].includes(pk())) {
        let o = "*"; if (pk() === "*" || pk() === "/" || pk() === "mod") o = nx().k;
        l = { t: "b", o, l, r: unary() };
      }
      return l;
    }
    function unary() {
      if (pk() === "-") { nx(); const c = unary(); return c.t === "n" ? { t: "n", v: -c.v } : { t: "u", c }; }
      if (pk() === "+") { nx(); return unary(); }
      return pow();
    }
    function pow() { const b = post(); if (pk() === "^") { nx(); return { t: "b", o: "^", l: b, r: unary() }; } return b; }
    function post() { let a = prim(); while (pk() === "!" || pk() === "%") a = { t: "f", o: nx().k, c: a }; return a; }
    function prim() {
      const x = nx(); if (!x) throw new Error(ERR.end);
      if (x.k === "n" || x.k === "c") return { t: "n", v: x.v };
      if (x.k === "(") { const e = expr(); const c = nx(); if (!c || c.k !== ")") throw new Error(ERR.bad); return { t: "p", c: e }; }
      if (x.k === "\u221A") return { t: "f", o: "\u221A", c: post() };
      if (x.k === "fn") return { t: "f", o: x.name, c: post() };
      throw new Error(ERR.bad);
    }
    const r = expr(); if (p < t.length) throw new Error(ERR.bad); return r;
  }

  const isN = n => n.t === "n";
  const ready = n => n.t === "b" ? isN(n.l) && isN(n.r) : (n.t === "u" || n.t === "f" || n.t === "p") ? isN(n.c) : false;
  const rank = n => n.t === "p" ? 5 : (n.t === "f" || n.t === "u") ? 4 : n.o === "^" ? 3 : (n.o === "*" || n.o === "/" || n.o === "mod") ? 2 : 1;
  const D = Math.PI / 180, cl = r => Math.abs(r) < 1e-12 ? 0 : r;

  function val(n) {
    if (n.t === "p") return n.c.v;
    if (n.t === "u") return -n.c.v;
    if (n.t === "f") {
      const v = n.c.v;
      switch (n.o) {
        case "%": return v / 100;
        case "\u221A": if (v < 0) throw new Error(ERR.root); return Math.sqrt(v);
        case "sin": return cl(Math.sin(v * D));
        case "cos": return cl(Math.cos(v * D));
        case "tan": if (Math.abs(Math.cos(v * D)) < 1e-12) throw new Error(ERR.big); return cl(Math.tan(v * D));
        case "log": if (v <= 0) throw new Error(ERR.log); return Math.log10(v);
        case "ln": if (v <= 0) throw new Error(ERR.log); return Math.log(v);
        case "abs": return Math.abs(v);
      }
      if (!Number.isInteger(v) || v < 0 || v > 170) throw new Error(ERR.fact);
      let r = 1; for (let i = 2; i <= v; i++) r *= i; return r;
    }
    const a = n.l.v, b = n.r.v; let r;
    if (n.o === "+") r = n.r.pct ? a + a * b / 100 : a + b;
    else if (n.o === "-") r = n.r.pct ? a - a * b / 100 : a - b;
    else if (n.o === "*") r = a * b;
    else if (n.o === "/" || n.o === "mod") { if (b === 0) throw new Error(ERR.zero); r = n.o === "/" ? a / b : a % b; }
    else r = Math.pow(a, b);
    if (!isFinite(r) || isNaN(r)) throw new Error(ERR.big);
    return r;
  }

  function collect(n, d, out) {
    if (isN(n)) return;
    if (ready(n)) out.push({ n, d });
    const nd = d + (n.t === "p" ? 1 : 0);
    if (n.t === "b") { collect(n.l, nd, out); collect(n.r, nd, out); } else collect(n.c, nd, out);
  }
  function replace(n, target, nv) {
    if (n === target) return nv;
    if (isN(n)) return n;
    if (n.t === "b") return { ...n, l: replace(n.l, target, nv), r: replace(n.r, target, nv) };
    return { ...n, c: replace(n.c, target, nv) };
  }
  function str(n, wrap) {
    if (n.t === "n") { const s = fmt(n.v) + (n.pct ? "%" : ""); return n.v < 0 && wrap ? "(" + s + ")" : s; }
    if (n.t === "p") return "(" + str(n.c, false) + ")";
    if (n.t === "u") return "\u2212" + str(n.c, true);
    if (n.t === "f") {
      if (n.o === "\u221A") return "\u221A" + str(n.c, true);
      if (n.o === "!" || n.o === "%") return str(n.c, true) + n.o;
      return n.o + (n.c.t === "p" ? str(n.c) : "(" + str(n.c) + ")");
    }
    const o = { "+": "+", "-": "\u2212", "*": "\u00D7", "/": "\u00F7", "^": "^", "mod": "mod" }[n.o];
    const sp = n.o === "^" ? "" : " ";
    return str(n.l, n.o === "^") + sp + o + sp + str(n.r, true);
  }
  function solve(expr) {
    let tree = parse(tokenize(expr));
    const steps = [str(tree, false)];
    let guard = 0;
    while (!isN(tree)) {
      if (++guard > 60) throw new Error("Ifoda juda uzun.");
      const c = []; collect(tree, 0, c);
      let best = c[0];
      for (const x of c) if (x.d > best.d || (x.d === best.d && rank(x.n) > rank(best.n))) best = x;
      tree = replace(tree, best.n, { t: "n", v: val(best.n) });
      steps.push(str(tree, false));
    }
    return { steps, result: fmt(tree.v) };
  }

  /* ---------- Yordamchilar ---------- */
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  const ints = (v, ...k) => k.forEach(x => { if (!Number.isInteger(v[x])) throw new Error(ERR.int); });
  const sign = x => x < 0 ? "\u2212 " + fmt(-x) : "+ " + fmt(x);

  /* ---------- Kasrlar ---------- */
  const F4 = [["a", "1-kasr surati"], ["b", "1-kasr maxraji"], ["c", "2-kasr surati"], ["d", "2-kasr maxraji"]];
  const F2 = F4.slice(0, 2);
  function outFrac(L, p, q) {
    if (q === 0) throw new Error(ERR.zero);
    if (q < 0) { p = -p; q = -q; }
    const g = gcd(p, q) || 1, a = p / g, b = q / g;
    if (g > 1) L.push("= " + fmt(a) + "/" + fmt(b) + "  (EKUB = " + g + ")");
    if (b !== 1 && Math.abs(a) > b) L.push("= " + Math.trunc(a / b) + " " + Math.abs(a % b) + "/" + b + "  (aralash son)");
    L.push("= " + R(a / b) + "  (o" + U + "nli kasr)");
    L.push("Javob: " + (b === 1 ? fmt(a) : fmt(a) + "/" + fmt(b)));
    return L;
  }
  const fk = (name, fields, f) => ({ name, fields, run: v => { ints(v, ...fields.map(x => x[0])); return f(v); } });
  const kasr = [
    fk("Qo" + U + "shish", F4, v => { if (!v.b || !v.d) throw new Error(ERR.zero); const p = v.a * v.d + v.c * v.b, q = v.b * v.d;
      return outFrac([`${v.a}/${v.b} + ${v.c}/${v.d}`, `= (${v.a}\u00D7${v.d} + ${v.c}\u00D7${v.b}) / (${v.b}\u00D7${v.d})`, `= ${fmt(p)}/${fmt(q)}`], p, q); }),
    fk("Ayirish", F4, v => { if (!v.b || !v.d) throw new Error(ERR.zero); const p = v.a * v.d - v.c * v.b, q = v.b * v.d;
      return outFrac([`${v.a}/${v.b} \u2212 ${v.c}/${v.d}`, `= (${v.a}\u00D7${v.d} \u2212 ${v.c}\u00D7${v.b}) / (${v.b}\u00D7${v.d})`, `= ${fmt(p)}/${fmt(q)}`], p, q); }),
    fk("Ko" + U + "paytirish", F4, v => { if (!v.b || !v.d) throw new Error(ERR.zero); const p = v.a * v.c, q = v.b * v.d;
      return outFrac([`${v.a}/${v.b} \u00D7 ${v.c}/${v.d}`, `= (${v.a}\u00D7${v.c}) / (${v.b}\u00D7${v.d})`, `= ${fmt(p)}/${fmt(q)}`], p, q); }),
    fk("Bo" + U + "lish", F4, v => { if (!v.b || !v.d || !v.c) throw new Error(ERR.zero); const p = v.a * v.d, q = v.b * v.c;
      return outFrac([`${v.a}/${v.b} \u00F7 ${v.c}/${v.d}`, `= ${v.a}/${v.b} \u00D7 ${v.d}/${v.c}`, `= ${fmt(p)}/${fmt(q)}`], p, q); }),
    fk("Soddalashtirish", F2, v => outFrac([`${v.a}/${v.b}`], v.a, v.b))
  ];

  /* ---------- Tenglamalar ---------- */
  const tenglama = [
    { name: "Chiziqli: ax + b = c", fields: [["a", "a"], ["b", "b"], ["c", "c"]], run: v => {
      if (v.a === 0) throw new Error("a nol bo" + U + "lmasligi kerak.");
      const r = (v.c - v.b) / v.a;
      return [`${fmt(v.a)}x ${sign(v.b)} = ${fmt(v.c)}`, `${fmt(v.a)}x = ${fmt(v.c)} \u2212 ${P(v.b)} = ${fmt(v.c - v.b)}`, `x = ${fmt(v.c - v.b)} \u00F7 ${P(v.a)}`, "Javob: x = " + R(r)];
    } },
    { name: "Kvadrat: ax\u00B2 + bx + c = 0", fields: [["a", "a"], ["b", "b"], ["c", "c"]], run: v => {
      if (v.a === 0) throw new Error("a nol bo" + U + "lmasligi kerak.");
      const d = v.b * v.b - 4 * v.a * v.c;
      const L = [`${fmt(v.a)}x\u00B2 ${sign(v.b)}x ${sign(v.c)} = 0`, `D = b\u00B2 \u2212 4ac = ${P(v.b)}\u00B2 \u2212 4 \u00D7 ${P(v.a)} \u00D7 ${P(v.c)} = ${fmt(d)}`];
      if (d < 0) { L.push("D < 0, haqiqiy ildiz yo" + U + "q."); return L; }
      if (d === 0) { L.push(`x = \u2212b \u00F7 2a = ${fmt(-v.b)} \u00F7 ${fmt(2 * v.a)}`); L.push("Javob: x = " + R(-v.b / (2 * v.a))); return L; }
      const s = Math.sqrt(d), x1 = (-v.b + s) / (2 * v.a), x2 = (-v.b - s) / (2 * v.a);
      L.push(`x\u2081 = (${fmt(-v.b)} + \u221A${fmt(d)}) \u00F7 ${fmt(2 * v.a)} = ${R(x1)}`);
      L.push(`x\u2082 = (${fmt(-v.b)} \u2212 \u221A${fmt(d)}) \u00F7 ${fmt(2 * v.a)} = ${R(x2)}`);
      L.push("Javob: x\u2081 = " + R(x1) + ",  x\u2082 = " + R(x2)); return L;
    } },
    { name: "Sistema: ikki tenglama", fields: [["a", "a\u2081 (x oldida)"], ["b", "b\u2081 (y oldida)"], ["c", "c\u2081"], ["d", "a\u2082"], ["e", "b\u2082"], ["f", "c\u2082"]], run: v => {
      const dd = v.a * v.e - v.d * v.b, dx = v.c * v.e - v.f * v.b, dy = v.a * v.f - v.d * v.c;
      const L = [`${fmt(v.a)}x ${sign(v.b)}y = ${fmt(v.c)}`, `${fmt(v.d)}x ${sign(v.e)}y = ${fmt(v.f)}`, `D = a\u2081b\u2082 \u2212 a\u2082b\u2081 = ${fmt(dd)}`, `D\u2093 = c\u2081b\u2082 \u2212 c\u2082b\u2081 = ${fmt(dx)}`, `D\u1D67 = a\u2081c\u2082 \u2212 a\u2082c\u2081 = ${fmt(dy)}`];
      if (dd === 0) { L.push(dx === 0 && dy === 0 ? "D = 0: cheksiz ko" + U + "p yechim bor." : "D = 0: yechim yo" + U + "q."); return L; }
      L.push("Javob: x = " + R(dx / dd) + ",  y = " + R(dy / dd)); return L;
    } }
  ];

  /* ---------- Geometriya ---------- */
  const PI = Math.PI;
  const sh = (name, keys, rows, pre) => ({ name, fields: keys.map(k => [k[0], k[1]]), run: v => {
    keys.forEach(k => { if (!(v[k[0]] > 0)) throw new Error(ERR.pos); });
    if (pre) pre(v);
    return rows.map(([lab, t, f]) => {
      const a = t.replace(/\{(\w+)\}/g, "$1"), b = t.replace(/\{(\w+)\}/g, (m, k) => fmt(v[k]));
      return `${lab} = ${a} = ${b} = ${R(f(v))}`;
    });
  } });
  const geom = [
    sh("Kvadrat", [["a", "Tomon a"]], [["Yuza", "{a}\u00B2", v => v.a ** 2], ["Perimetr", "4 \u00D7 {a}", v => 4 * v.a], ["Diagonal", "{a} \u00D7 \u221A2", v => v.a * Math.SQRT2]]),
    sh("To" + U + "g" + U + "ri to" + U + "rtburchak", [["a", "Uzunlik a"], ["b", "Eni b"]], [["Yuza", "{a} \u00D7 {b}", v => v.a * v.b], ["Perimetr", "2 \u00D7 ({a} + {b})", v => 2 * (v.a + v.b)], ["Diagonal", "\u221A({a}\u00B2 + {b}\u00B2)", v => Math.hypot(v.a, v.b)]]),
    sh("Uchburchak: asos va balandlik", [["a", "Asos a"], ["h", "Balandlik h"]], [["Yuza", "{a} \u00D7 {h} \u00F7 2", v => v.a * v.h / 2]]),
    sh("Uchburchak: 3 tomon (Geron)", [["a", "a"], ["b", "b"], ["c", "c"]], [["Yarim perimetr p", "({a} + {b} + {c}) \u00F7 2", v => v.p], ["Yuza", "\u221A({p} \u00D7 ({p} \u2212 {a}) \u00D7 ({p} \u2212 {b}) \u00D7 ({p} \u2212 {c}))", v => Math.sqrt(v.p * (v.p - v.a) * (v.p - v.b) * (v.p - v.c))], ["Perimetr", "{a} + {b} + {c}", v => v.a + v.b + v.c]],
      v => { if (v.a + v.b <= v.c || v.a + v.c <= v.b || v.b + v.c <= v.a) throw new Error("Bunday uchburchak mavjud emas."); v.p = (v.a + v.b + v.c) / 2; }),
    sh("To" + U + "g" + U + "ri burchakli uchburchak", [["a", "Katet a"], ["b", "Katet b"]], [["Gipotenuza c", "\u221A({a}\u00B2 + {b}\u00B2)", v => Math.hypot(v.a, v.b)], ["Yuza", "{a} \u00D7 {b} \u00F7 2", v => v.a * v.b / 2], ["Perimetr", "{a} + {b} + c", v => v.a + v.b + Math.hypot(v.a, v.b)]]),
    sh("Pifagor: katetni topish", [["c", "Gipotenuza c"], ["a", "Katet a"]], [["Katet b", "\u221A({c}\u00B2 \u2212 {a}\u00B2)", v => Math.sqrt(v.c * v.c - v.a * v.a)]], v => { if (v.c <= v.a) throw new Error("Gipotenuza katetdan katta bo" + U + "lishi kerak."); }),
    sh("Doira", [["r", "Radius r"]], [["Yuza", "\u03C0 \u00D7 {r}\u00B2", v => PI * v.r ** 2], ["Aylana uzunligi", "2 \u00D7 \u03C0 \u00D7 {r}", v => 2 * PI * v.r], ["Diametr", "2 \u00D7 {r}", v => 2 * v.r]]),
    sh("Doira sektori", [["r", "Radius r"], ["n", "Burchak (gradus)"]], [["Yoy uzunligi", "\u03C0 \u00D7 {r} \u00D7 {n} \u00F7 180", v => PI * v.r * v.n / 180], ["Yuza", "\u03C0 \u00D7 {r}\u00B2 \u00D7 {n} \u00F7 360", v => PI * v.r ** 2 * v.n / 360]]),
    sh("Parallelogramm", [["a", "Asos a"], ["b", "Yon tomon b"], ["h", "Balandlik h"]], [["Yuza", "{a} \u00D7 {h}", v => v.a * v.h], ["Perimetr", "2 \u00D7 ({a} + {b})", v => 2 * (v.a + v.b)]]),
    sh("Romb", [["d", "Diagonal d\u2081"], ["e", "Diagonal d\u2082"]], [["Yuza", "{d} \u00D7 {e} \u00F7 2", v => v.d * v.e / 2], ["Tomon s", "\u221A(({d} \u00F7 2)\u00B2 + ({e} \u00F7 2)\u00B2)", v => v.s], ["Perimetr", "4 \u00D7 {s}", v => 4 * v.s]], v => { v.s = Math.hypot(v.d / 2, v.e / 2); }),
    sh("Trapetsiya", [["a", "Asos a"], ["b", "Asos b"], ["h", "Balandlik h"]], [["Yuza", "({a} + {b}) \u00F7 2 \u00D7 {h}", v => (v.a + v.b) / 2 * v.h]]),
    sh("Ko" + U + "pburchak burchaklari", [["n", "Tomonlar soni n"]], [["Ichki burchaklar yig" + U + "indisi", "({n} \u2212 2) \u00D7 180", v => (v.n - 2) * 180], ["Muntazam: bitta burchak", "({n} \u2212 2) \u00D7 180 \u00F7 {n}", v => (v.n - 2) * 180 / v.n]], v => { if (!Number.isInteger(v.n) || v.n < 3) throw new Error("n kamida 3 bo" + U + "lgan butun son."); }),
    sh("Kub", [["a", "Qirra a"]], [["Hajm", "{a}\u00B3", v => v.a ** 3], ["To" + U + "la sirt", "6 \u00D7 {a}\u00B2", v => 6 * v.a ** 2], ["Diagonal", "{a} \u00D7 \u221A3", v => v.a * Math.sqrt(3)]]),
    sh("Parallelepiped", [["a", "a"], ["b", "b"], ["c", "c"]], [["Hajm", "{a} \u00D7 {b} \u00D7 {c}", v => v.a * v.b * v.c], ["To" + U + "la sirt", "2 \u00D7 ({a}\u00D7{b} + {b}\u00D7{c} + {a}\u00D7{c})", v => 2 * (v.a * v.b + v.b * v.c + v.a * v.c)], ["Diagonal", "\u221A({a}\u00B2 + {b}\u00B2 + {c}\u00B2)", v => Math.sqrt(v.a ** 2 + v.b ** 2 + v.c ** 2)]]),
    sh("Silindr", [["r", "Radius r"], ["h", "Balandlik h"]], [["Hajm", "\u03C0 \u00D7 {r}\u00B2 \u00D7 {h}", v => PI * v.r ** 2 * v.h], ["Yon sirt", "2 \u00D7 \u03C0 \u00D7 {r} \u00D7 {h}", v => 2 * PI * v.r * v.h], ["To" + U + "la sirt", "2 \u00D7 \u03C0 \u00D7 {r} \u00D7 ({r} + {h})", v => 2 * PI * v.r * (v.r + v.h)]]),
    sh("Konus", [["r", "Radius r"], ["h", "Balandlik h"]], [["Yasovchi l", "\u221A({r}\u00B2 + {h}\u00B2)", v => v.l], ["Hajm", "\u03C0 \u00D7 {r}\u00B2 \u00D7 {h} \u00F7 3", v => PI * v.r ** 2 * v.h / 3], ["Yon sirt", "\u03C0 \u00D7 {r} \u00D7 {l}", v => PI * v.r * v.l], ["To" + U + "la sirt", "\u03C0 \u00D7 {r} \u00D7 ({r} + {l})", v => PI * v.r * (v.r + v.l)]], v => { v.l = Math.hypot(v.r, v.h); }),
    sh("Shar", [["r", "Radius r"]], [["Hajm", "4 \u00F7 3 \u00D7 \u03C0 \u00D7 {r}\u00B3", v => 4 / 3 * PI * v.r ** 3], ["Sirt", "4 \u00D7 \u03C0 \u00D7 {r}\u00B2", v => 4 * PI * v.r ** 2]]),
    sh("Piramida (kvadrat asosli)", [["a", "Asos tomoni a"], ["h", "Balandlik h"]], [["Asos yuzi", "{a}\u00B2", v => v.a ** 2], ["Hajm", "{a}\u00B2 \u00D7 {h} \u00F7 3", v => v.a ** 2 * v.h / 3]])
  ].map(k => ({ ...k }));

  /* ---------- Sonlar ---------- */
  const AB = [["a", "Birinchi son"], ["b", "Ikkinchi son"]];
  const son = [
    { name: "EKUB va EKUK", fields: AB, run: v => {
      ints(v, "a", "b"); if (v.a <= 0 || v.b <= 0) throw new Error("Musbat butun sonlar kiriting.");
      const L = []; let x = v.a, y = v.b;
      while (y) { const q = Math.floor(x / y), r = x % y; L.push(`${fmt(x)} = ${fmt(y)} \u00D7 ${q} + ${r}`); x = y; y = r; }
      L.push("EKUB = " + fmt(x)); L.push(`EKUK = ${fmt(v.a)} \u00D7 ${fmt(v.b)} \u00F7 ${fmt(x)} = ${fmt(v.a * v.b / x)}`);
      L.push("Javob: EKUB = " + fmt(x) + ",  EKUK = " + fmt(v.a * v.b / x)); return L;
    } },
    { name: "Qoldiqli bo" + U + "lish", fields: [["a", "Bo" + U + "linuvchi"], ["b", "Bo" + U + "luvchi"]], run: v => {
      ints(v, "a", "b"); if (v.b === 0) throw new Error(ERR.zero);
      const q = Math.trunc(v.a / v.b), r = v.a - q * v.b;
      return [`${fmt(v.a)} \u00F7 ${fmt(v.b)}`, `${fmt(v.b)} \u00D7 ${fmt(q)} = ${fmt(v.b * q)}`, `${fmt(v.a)} \u2212 ${fmt(v.b * q)} = ${fmt(r)}`, `Javob: ${fmt(q)}, qoldiq ${fmt(r)}`];
    } },
    { name: "Tub ko" + U + "paytuvchilarga ajratish", fields: [["n", "Son"]], run: v => {
      ints(v, "n"); if (v.n < 2 || v.n > 1e12) throw new Error("2 dan 1 000 000 000 000 gacha son kiriting.");
      let m = v.n; const f = [];
      for (let p = 2; p * p <= m; p++) while (m % p === 0) { f.push(p); m /= p; }
      if (m > 1) f.push(m);
      return [`${fmt(v.n)} = ${f.map(fmt).join(" \u00D7 ")}`, f.length === 1 ? "Javob: bu tub son." : "Javob: murakkab son."];
    } }
  ];

  /* ---------- Foiz ---------- */
  const foiz = [
    { name: "Sondan foiz", fields: [["a", "Son"], ["p", "Foiz"]], run: v => [`${fmt(v.a)} ning ${fmt(v.p)}% i`, `${fmt(v.a)} \u00D7 ${fmt(v.p)} \u00F7 100`, "Javob: " + R(v.a * v.p / 100)] },
    { name: "Necha foiz", fields: [["a", "Qism"], ["b", "Butun"]], run: v => { if (!v.b) throw new Error(ERR.zero); return [`${fmt(v.a)} soni ${fmt(v.b)} ning necha foizi`, `${fmt(v.a)} \u00F7 ${fmt(v.b)} \u00D7 100`, "Javob: " + R(v.a / v.b * 100) + "%"]; } },
    { name: "Foizga oshirish va kamaytirish", fields: [["a", "Son"], ["p", "Foiz"]], run: v => [`${fmt(v.a)} + ${fmt(v.p)}% = ${fmt(v.a)} \u00D7 (1 + ${fmt(v.p)}\u00F7100) = ${R(v.a * (1 + v.p / 100))}`, `${fmt(v.a)} \u2212 ${fmt(v.p)}% = ${fmt(v.a)} \u00D7 (1 \u2212 ${fmt(v.p)}\u00F7100) = ${R(v.a * (1 - v.p / 100))}`] }
  ];

  const mods = [
    { id: "kasr", name: "Kasrlar", kinds: kasr },
    { id: "tenglama", name: "Tenglama", kinds: tenglama, text: true },
    { id: "geom", name: "Geometriya", kinds: geom },
    { id: "son", name: "Sonlar", kinds: son },
    { id: "foiz", name: "Foiz", kinds: foiz }
  ];
  window.Engine = { solve, fmt, mods };
})();
