"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { recipes, defaultPricesBase } from "@/data/recipes";
import { categories, productsBase } from "@/data/products";

const ENERGY_PRICE = 1;
const AUCTION_URL =
  "https://yfamesaijwutdhnlifsc.supabase.co/functions/v1/stalcraft-auction";
const LS_KEY = "stalcraft_settings_v2";

// ── Helpers ───────────────────────────────────────────────────────────────────
function cleanNumber(v) {
  const n = Number(
    String(v)
      .replace(/[^\d.,]/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : 0;
}
function fmt(v) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
    .format(Math.ceil(v || 0))
    .replace(/\u00A0/g, " ");
}
function money(v) {
  return `${fmt(v)}р`;
}

function costPerUnit(recipeId, getPriceOf, memo) {
  if (!memo) memo = {};
  if (memo[recipeId] != null) return memo[recipeId];
  const recipe = recipes[recipeId];
  if (!recipe) return 0;
  const cost =
    (recipe.ingredients.reduce((sum, ing) => {
      if (ing.type === "buy") return sum + ing.qty * getPriceOf(ing.name);
      return sum + ing.qty * costPerUnit(ing.recipe, getPriceOf, memo);
    }, 0) +
      recipe.energy * ENERGY_PRICE) /
    recipe.output;
  memo[recipeId] = cost;
  return cost;
}

function expandRecipe(recipeId, needed, getPriceOf, sections, shopping) {
  const recipe = recipes[recipeId];
  if (!recipe) return;
  const crafts = Math.ceil(needed / recipe.output);
  if (!sections.has(recipeId)) {
    sections.set(recipeId, {
      recipeId,
      needed: 0,
      crafts: 0,
      produced: 0,
      rows: new Map(),
      energy: 0,
    });
  }
  const sec = sections.get(recipeId);
  sec.needed += needed;
  sec.crafts += crafts;
  sec.produced += crafts * recipe.output;
  sec.energy += crafts * recipe.energy;

  for (const ing of recipe.ingredients) {
    const totalQty = crafts * ing.qty;
    if (ing.type === "buy") {
      const price = getPriceOf(ing.name);
      if (!shopping.has(ing.name))
        shopping.set(ing.name, { name: ing.name, qty: 0, price });
      shopping.get(ing.name).qty += totalQty;
      shopping.get(ing.name).price = price;
      const key = "buy:" + ing.name;
      if (!sec.rows.has(key))
        sec.rows.set(key, {
          name: ing.name,
          type: "Покупается",
          qty: 0,
          price,
          total: 0,
          buyName: ing.name,
        });
      const r = sec.rows.get(key);
      r.qty += totalQty;
      r.total += totalQty * price;
      r.price = price;
    } else {
      const unit = costPerUnit(ing.recipe, getPriceOf, {});
      const key = "craft:" + ing.recipe;
      if (!sec.rows.has(key))
        sec.rows.set(key, {
          name: ing.name,
          type: "Крафтится",
          qty: 0,
          price: unit,
          total: 0,
        });
      const r = sec.rows.get(key);
      r.qty += totalQty;
      r.total += totalQty * unit;
      r.price = unit;
      expandRecipe(ing.recipe, totalQty, getPriceOf, sections, shopping);
    }
  }
  const eKey = "energy";
  if (!sec.rows.has(eKey))
    sec.rows.set(eKey, {
      name: "Энергия",
      type: "Расход",
      qty: 0,
      price: ENERGY_PRICE,
      total: 0,
    });
  const er = sec.rows.get(eKey);
  er.qty += crafts * recipe.energy;
  er.total += crafts * recipe.energy * ENERGY_PRICE;
}

function calculate(product, getPriceOf) {
  const sections = new Map();
  const shopping = new Map();
  expandRecipe(product.recipe, product.qty, getPriceOf, sections, shopping);
  const totalBuy = Array.from(shopping.values()).reduce(
    (s, r) => s + r.qty * r.price,
    0,
  );
  const totalEnergy = Array.from(sections.values()).reduce(
    (s, sec) => s + sec.crafts * recipes[sec.recipeId].energy * ENERGY_PRICE,
    0,
  );
  return {
    sections: Array.from(sections.values()),
    shopping: Array.from(shopping.values()),
    totalCost: totalBuy + totalEnergy,
    revenue: product.qty * product.sale,
  };
}

// ── Supabase lazy init ────────────────────────────────────────────────────────
let _sbPromise = null;
function getSb() {
  if (!_sbPromise) {
    _sbPromise = (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return null;
      try {
        // dynamic import via CDN to avoid build-time issues
        const mod = await import(
          /* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
        );
        return mod.createClient(url, key);
      } catch (e) {
        console.warn("Supabase unavailable", e);
        return null;
      }
    })();
  }
  return _sbPromise;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [activeCategory, setActiveCategory] = useState("cooking");
  const [activeProductId, setActiveProductId] = useState("foil");
  const [products, setProducts] = useState(() => {
    const m = {};
    Object.entries(productsBase).forEach(([k, v]) => {
      m[k] = { ...v };
    });
    return m;
  });
  const [defaultPrices, setDefaultPrices] = useState(() => ({
    ...defaultPricesBase,
  }));
  const [prices, setPrices] = useState({}); // per-product overrides
  const [auctionData, setAuctionData] = useState({});
  const [auctionLoading, setAuctionLoading] = useState(false);

  // Auth
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [authModal, setAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState("login");
  const [showForgot, setShowForgot] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [profileModal, setProfileModal] = useState(false);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePw1, setProfilePw1] = useState("");
  const [profilePw2, setProfilePw2] = useState("");
  const [profileUsernameMsg, setProfileUsernameMsg] = useState({
    text: "",
    ok: false,
  });
  const [profileEmailMsg, setProfileEmailMsg] = useState({
    text: "",
    ok: false,
  });
  const [profilePwMsg, setProfilePwMsg] = useState({ text: "", ok: false });

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [unread, setUnread] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

  const chatMsgRef = useRef(null);
  const sbChRef = useRef({ chat: null, presence: null });
  const saveTimer = useRef(null);
  const auctionTimer = useRef(null);
  const cursorRing = useRef(null);
  const cursorDot = useRef(null);

  // ── Price getter ──────────────────────────────────────────────────────────────
  const getPriceOf = useCallback(
    (name) => {
      return prices[activeProductId]?.[name] ?? defaultPrices[name] ?? 0;
    },
    [prices, activeProductId, defaultPrices],
  );

  // ── Calculation ───────────────────────────────────────────────────────────────
  const product = products[activeProductId];
  const calc = useMemo(() => {
    if (!product) return null;
    return calculate(product, getPriceOf);
  }, [product, getPriceOf]);

  const theoCost = useMemo(() => {
    if (!product) return 0;
    return costPerUnit(product.recipe, getPriceOf, {});
  }, [product, getPriceOf]);

  const profit = calc ? calc.revenue - calc.totalCost : 0;
  const margin = calc && calc.revenue > 0 ? (profit / calc.revenue) * 100 : 0;
  const realUnit =
    calc && product ? calc.totalCost / Math.max(product.qty, 1) : 0;

  // ── Settings ──────────────────────────────────────────────────────────────────
  function collectSettings() {
    const prods = {};
    Object.entries(products).forEach(([k, v]) => {
      prods[k] = { sale: v.sale, qty: v.qty };
    });
    return { activeProductId, products: prods, prices, defaultPrices };
  }

  function applySettings(s) {
    if (!s) return;
    if (s.activeProductId && productsBase[s.activeProductId]) {
      setActiveProductId(s.activeProductId);
      setActiveCategory(productsBase[s.activeProductId].category);
    }
    if (s.products)
      setProducts((prev) => {
        const next = { ...prev };
        Object.entries(s.products).forEach(([k, v]) => {
          if (next[k])
            next[k] = {
              ...next[k],
              sale: v.sale ?? next[k].sale,
              qty: v.qty ?? next[k].qty,
            };
        });
        return next;
      });
    if (s.prices) setPrices(s.prices);
    if (s.defaultPrices) setDefaultPrices(s.defaultPrices);
  }

  const saveSettings = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const s = collectSettings();
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(s));
      } catch (e) {}
      const sb = await getSb();
      if (sb && user) {
        await sb
          .from("user_settings")
          .upsert(
            {
              user_id: user.id,
              settings: s,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
      }
    }, 1500);
  }, [user, products, prices, defaultPrices, activeProductId]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const r = localStorage.getItem(LS_KEY);
      if (r) applySettings(JSON.parse(r));
    } catch (e) {}
  }, []);

  // ── Auth init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const sb = await getSb();
      if (!sb || cancelled) return;
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (session?.user && !cancelled) await handleSignIn(session.user, sb);
      if (!cancelled) {
        sb.auth.onAuthStateChange(async (event, sess) => {
          if (event === "SIGNED_IN" && sess?.user)
            await handleSignIn(sess.user, sb);
          if (event === "SIGNED_OUT") {
            setUser(null);
            setProfile(null);
          }
        });
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignIn(u, sb) {
    setUser(u);
    await new Promise((r) => setTimeout(r, 600));
    const { data: prof } = await sb
      .from("profiles")
      .select("*")
      .eq("id", u.id)
      .maybeSingle();
    setProfile(prof);
    setAuthModal(false);
    const { data: settingsRow } = await sb
      .from("user_settings")
      .select("settings")
      .eq("user_id", u.id)
      .maybeSingle();
    if (settingsRow?.settings) applySettings(settingsRow.settings);
    initPresence(sb, u, prof);
    initChat(sb, u, prof);
  }

  // ── Presence ──────────────────────────────────────────────────────────────────
  async function initPresence(sb, u, prof) {
    if (sbChRef.current.presence) sb.removeChannel(sbChRef.current.presence);
    const ch = sb.channel("online-users", {
      config: { presence: { key: u?.id || "anon-" + Math.random() } },
    });
    ch.on("presence", { event: "sync" }, () =>
      setOnlineCount(Object.keys(ch.presenceState()).length),
    ).subscribe(async (status) => {
      if (status === "SUBSCRIBED")
        await ch.track({
          user: prof?.username || "Гость",
          online_at: new Date().toISOString(),
        });
    });
    sbChRef.current.presence = ch;
  }

  // ── Chat ──────────────────────────────────────────────────────────────────────
  async function initChat(sb, u, prof) {
    if (sbChRef.current.chat) sb.removeChannel(sbChRef.current.chat);
    const { data: msgs } = await sb
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50);
    setChatMessages(msgs || []);
    const ch = sb
      .channel("chat-room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setChatMessages((prev) => [...prev, payload.new]);
          if (!chatOpen) setUnread((n) => n + 1);
        },
      )
      .subscribe();
    sbChRef.current.chat = ch;
  }

  useEffect(() => {
    if (chatOpen) setUnread(0);
  }, [chatOpen]);
  useEffect(() => {
    if (chatMsgRef.current)
      chatMsgRef.current.scrollTop = chatMsgRef.current.scrollHeight;
  }, [chatMessages, chatOpen]);

  async function sendMessage() {
    if (!user || !chatInput.trim()) return;
    const sb = await getSb();
    if (!sb) return;
    await sb
      .from("messages")
      .insert({
        user_id: user.id,
        username: profile?.username || user.email,
        text: chatInput.trim(),
      });
    setChatInput("");
  }

  // ── Custom cursor + audio ──────────────────────────────────────────────────────
  useEffect(() => {
    const ring = cursorRing.current;
    const dot = cursorDot.current;
    if (!ring || !dot) return;
    let lastHover = 0;
    let audioCtx = null;
    function unlockAudio() {
      if (!audioCtx)
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    }
    function playSound(type) {
      if (!audioCtx || audioCtx.state !== "running") return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;
      osc.type = type === "click" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(type === "click" ? 420 : 720, now);
      osc.frequency.exponentialRampToValueAtTime(
        type === "click" ? 260 : 930,
        now + 0.075,
      );
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(
        type === "click" ? 0.035 : 0.018,
        now + 0.01,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }
    function onMove(e) {
      if (e.pointerType === "touch") return;
      document.body.classList.add("cursor-ready");
      const t = `translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%)`;
      ring.style.transform = t;
      dot.style.transform = t;
      document.body.classList.toggle(
        "cursor-hover",
        !!e.target.closest("button,input,a"),
      );
    }
    function onDown(e) {
      if (e.pointerType === "touch") return;
      document.body.classList.add("cursor-down");
      unlockAudio();
      if (e.target.closest("button")) playSound("click");
    }
    function onUp() {
      document.body.classList.remove("cursor-down");
    }
    function onOver(e) {
      if (e.pointerType === "touch" || !e.target.closest("button")) return;
      const now = performance.now();
      if (now - lastHover < 70) return;
      lastHover = now;
      unlockAudio();
      playSound("hover");
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointerover", onOver);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerover", onOver);
      document.body.classList.remove(
        "cursor-ready",
        "cursor-hover",
        "cursor-down",
      );
    };
  }, []);

  // ── Auction ───────────────────────────────────────────────────────────────────
  const loadAuction = useCallback(async () => {
    if (auctionLoading) return;
    setAuctionLoading(true);
    const names = new Set();
    if (calc) calc.shopping.forEach((r) => names.add(r.name));
    if (product) names.add(product.name);
    try {
      const res = await fetch(AUCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: [...names] }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setAuctionData((prev) => ({ ...prev, ...data }));
    } catch (e) {
      console.warn("Auction error", e);
    } finally {
      setAuctionLoading(false);
    }
  }, [auctionLoading, calc, product]);

  useEffect(() => {
    clearTimeout(auctionTimer.current);
    auctionTimer.current = setTimeout(loadAuction, 900);
  }, [activeProductId]);

  // ── Selectors ─────────────────────────────────────────────────────────────────
  function selectCategory(id) {
    setActiveCategory(id);
    const first = Object.keys(products).find(
      (k) => products[k].category === id,
    );
    if (first) setActiveProductId(first);
  }

  function selectProduct(id) {
    setActiveProductId(id);
    setActiveCategory(products[id].category);
  }

  // ── Price / qty / sale updaters ────────────────────────────────────────────────
  function updateIngredientPrice(name, value) {
    const num = cleanNumber(value);
    setPrices((prev) => ({
      ...prev,
      [activeProductId]: { ...(prev[activeProductId] || {}), [name]: num },
    }));
    saveSettings();
  }

  function updateQty(value) {
    const num = Math.max(0, Math.floor(cleanNumber(value)));
    setProducts((prev) => ({
      ...prev,
      [activeProductId]: { ...prev[activeProductId], qty: num },
    }));
    saveSettings();
  }

  function updateSale(value) {
    const num = cleanNumber(value);
    setProducts((prev) => ({
      ...prev,
      [activeProductId]: { ...prev[activeProductId], sale: num },
    }));
    saveSettings();
  }

  // ── Auth actions ──────────────────────────────────────────────────────────────
  async function doLogin() {
    setLoginError("");
    const sb = await getSb();
    if (!sb) {
      setLoginError("Supabase не настроен");
      return;
    }
    const { error } = await sb.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) {
      if (error.message.includes("Email not confirmed")) {
        setOtpStep(true);
      } else setLoginError("Неверный email или пароль");
    }
  }

  async function doRegister() {
    setRegError("");
    const sb = await getSb();
    if (!sb) {
      setRegError("Supabase не настроен");
      return;
    }
    if (!regUsername || !regEmail || !regPassword) {
      setRegError("Заполни все поля");
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(regUsername)) {
      setRegError("Некорректный логин");
      return;
    }
    if (regPassword.length < 8) {
      setRegError("Пароль минимум 8 символов");
      return;
    }
    const { data: exists } = await sb
      .from("profiles")
      .select("id")
      .eq("username", regUsername)
      .single();
    if (exists) {
      setRegError("Логин уже занят");
      return;
    }
    const { error } = await sb.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: { data: { username: regUsername } },
    });
    if (error) {
      setRegError(error.message);
      return;
    }
    setOtpStep(true);
  }

  async function doVerifyOTP() {
    setOtpError("");
    const sb = await getSb();
    if (!sb) return;
    const token = otpCode.join("");
    if (token.length < 6) {
      setOtpError("Введи 6 цифр");
      return;
    }
    const email = regEmail || loginEmail;
    const { error } = await sb.auth.verifyOtp({ email, token, type: "signup" });
    if (error) {
      setOtpError(error.message);
      return;
    }
    setAuthModal(false);
    setOtpStep(false);
  }

  async function doForgot() {
    setForgotError("");
    setForgotSuccess("");
    const sb = await getSb();
    if (!sb) return;
    if (!forgotEmail) {
      setForgotError("Введи email");
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : "",
    });
    if (error) setForgotError(error.message);
    else setForgotSuccess("✅ Письмо отправлено — проверь почту");
  }

  async function doLogout() {
    const sb = await getSb();
    if (!sb) return;
    await sb.auth.signOut();
    setDropdownOpen(false);
  }

  async function updateUsernameProfile() {
    const sb = await getSb();
    if (!sb || !user) return;
    setProfileUsernameMsg({ text: "", ok: false });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(profileUsername)) {
      setProfileUsernameMsg({
        text: "3–20 символов: буквы, цифры, _",
        ok: false,
      });
      return;
    }
    await sb
      .from("profiles")
      .update({ username: profileUsername })
      .eq("id", user.id);
    setProfile((p) => ({ ...p, username: profileUsername }));
    setProfileUsernameMsg({ text: "✅ Логин обновлён", ok: true });
  }

  async function updateEmailProfile() {
    const sb = await getSb();
    if (!sb) return;
    setProfileEmailMsg({ text: "", ok: false });
    if (!profileEmail) {
      setProfileEmailMsg({ text: "Введи email", ok: false });
      return;
    }
    const { error } = await sb.auth.updateUser({ email: profileEmail });
    if (error) setProfileEmailMsg({ text: error.message, ok: false });
    else
      setProfileEmailMsg({
        text: "✅ Подтверди смену на новой почте",
        ok: true,
      });
  }

  async function updatePwProfile() {
    const sb = await getSb();
    if (!sb) return;
    setProfilePwMsg({ text: "", ok: false });
    if (profilePw1.length < 8) {
      setProfilePwMsg({ text: "Минимум 8 символов", ok: false });
      return;
    }
    if (profilePw1 !== profilePw2) {
      setProfilePwMsg({ text: "Пароли не совпадают", ok: false });
      return;
    }
    const { error } = await sb.auth.updateUser({ password: profilePw1 });
    if (error) setProfilePwMsg({ text: error.message, ok: false });
    else setProfilePwMsg({ text: "✅ Пароль изменён", ok: true });
  }

  // ── Helpers for render ────────────────────────────────────────────────────────
  function auctionCell(name) {
    const a = auctionData[name];
    if (!a)
      return (
        <span
          style={{
            color: "#666",
            fontSize: 12,
            animation: auctionLoading ? "pulse 1.2s infinite" : "none",
          }}
        >
          {auctionLoading ? "…" : "—"}
        </span>
      );
    if (a.price == null)
      return <span style={{ color: "#555", fontSize: 12 }}>нет</span>;
    const myPrice = getPriceOf(name);
    const diff = a.price - myPrice;
    const color =
      diff > myPrice * 0.05
        ? "#ff6b6b"
        : diff < -(myPrice * 0.05)
          ? "#83e092"
          : "#aaa";
    const title =
      diff > 0
        ? `Аукцион дороже на ${money(diff)}`
        : diff < 0
          ? `Аукцион дешевле на ${money(-diff)}`
          : "Цена близка";
    return (
      <span style={{ color, fontSize: 12, fontWeight: 600 }} title={title}>
        {money(a.price)}
      </span>
    );
  }

  const category = categories[activeCategory];
  const productTabsInCategory = Object.entries(products).filter(
    ([, p]) => p.category === activeCategory,
  );
  const auctionSale = product && auctionData[product.name];

  // ── Inline style constants ─────────────────────────────────────────────────────
  const panelStyle = {
    background:
      "linear-gradient(180deg,rgba(255,255,255,.025),transparent) var(--panel)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 10,
    boxShadow: "0 16px 45px rgba(0,0,0,.32)",
    overflow: "hidden",
  };
  const panelHead = {
    padding: "13px 16px",
    borderBottom: "1px solid rgba(255,255,255,.08)",
    background: "linear-gradient(180deg,#222b31,#172025)",
    color: "#fff7df",
    fontSize: 15,
    fontWeight: 700,
  };
  const sectionTitleStyle = {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: "8px 16px",
    padding: "10px 15px",
    background: "linear-gradient(180deg,#181e23,#111619)",
    color: "#f7f1dc",
  };
  const sectionMetaStyle = {
    padding: "0 15px 11px",
    background: "#111619",
    color: "#8f9b95",
    fontSize: 12,
  };

  return (
    <>
      {/* Custom cursor */}
      <div className="custom-cursor" ref={cursorRing} aria-hidden="true" />
      <div className="custom-cursor-dot" ref={cursorDot} aria-hidden="true" />

      {/* ══ HEADER ══════════════════════════════════════════════════════════════ */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid rgba(255,255,255,.08)",
          background: "rgba(13,16,18,.92)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "16px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  margin: "0 0 12px",
                  color: "#fff7df",
                  fontSize: 22,
                  fontWeight: 900,
                }}
              >
                Калькулятор крафта STALCRAFT
              </h1>

              {/* Category tabs */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginBottom: 9,
                }}
              >
                {Object.entries(categories).map(([id, cat]) => {
                  const active = id === activeCategory;
                  return (
                    <button
                      key={id}
                      onClick={() => selectCategory(id)}
                      style={{
                        minHeight: 38,
                        padding: "0 14px",
                        fontWeight: 700,
                        cursor: "pointer",
                        border: `1px solid ${active ? "#69b6e8" : "rgba(255,255,255,.1)"}`,
                        borderRadius: 6,
                        background: active
                          ? "linear-gradient(180deg,#28475a,#18313f)"
                          : "linear-gradient(180deg,#1b242a,#12181c)",
                        color: active ? "#e8f7ff" : "#d4ddd8",
                        boxShadow: active
                          ? "0 4px 18px rgba(68,159,220,.22)"
                          : "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        transition: "all .15s",
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          display: "inline-block",
                          background: active ? "#8ef1a0" : "#64737b",
                          boxShadow: active
                            ? "0 0 14px rgba(142,241,160,.78)"
                            : "0 0 8px rgba(100,115,123,.35)",
                        }}
                      />
                      {cat.name}
                    </button>
                  );
                })}
              </div>

              {/* Product tabs */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: 4,
                  border: "1px solid rgba(255,255,255,.07)",
                  borderRadius: 8,
                  background: "rgba(0,0,0,.22)",
                  width: "fit-content",
                  maxWidth: "100%",
                }}
              >
                {productTabsInCategory.length === 0 ? (
                  <span
                    style={{
                      padding: "0 12px",
                      color: "#8f9b95",
                      fontSize: 13,
                      minHeight: 36,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    Нет товаров
                  </span>
                ) : (
                  productTabsInCategory.map(([id, p]) => {
                    const active = id === activeProductId;
                    return (
                      <button
                        key={id}
                        onClick={() => selectProduct(id)}
                        style={{
                          minHeight: 36,
                          border: 0,
                          borderRadius: 6,
                          padding: "0 13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          background: active
                            ? "linear-gradient(180deg,#f0c76a,#c9942f)"
                            : "transparent",
                          color: active ? "#15100a" : "#c9d0cc",
                          boxShadow: active
                            ? "0 4px 18px rgba(214,167,66,.25)"
                            : "none",
                          transition: "all .15s",
                        }}
                      >
                        {p.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Online + Auth */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexShrink: 0,
              }}
            >
              <div
                onClick={() => setChatOpen((o) => !o)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 20,
                  background: "var(--panel)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#4caf50",
                    boxShadow: "0 0 6px #4caf5088",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span>{onlineCount} онлайн</span>
              </div>
              {user ? (
                <div style={{ position: "relative" }}>
                  <div
                    onClick={() => setDropdownOpen((o) => !o)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--panel-2)",
                      border: "2px solid var(--line)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 14,
                      color: "var(--accent)",
                      flexShrink: 0,
                    }}
                  >
                    {(profile?.username || user.email || "?")[0].toUpperCase()}
                  </div>
                  {dropdownOpen && (
                    <>
                      <div
                        style={{ position: "fixed", inset: 0, zIndex: 140 }}
                        onClick={() => setDropdownOpen(false)}
                      />
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "calc(100% + 8px)",
                          background: "var(--panel)",
                          border: "1px solid var(--line)",
                          borderRadius: 10,
                          minWidth: 200,
                          zIndex: 150,
                          boxShadow: "0 16px 48px rgba(0,0,0,.5)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding: "14px 16px",
                            borderBottom: "1px solid var(--line)",
                            background: "var(--panel-2)",
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 14 }}>
                            {profile?.username || "Сталкер"}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--muted)",
                              marginTop: 2,
                              wordBreak: "break-all",
                            }}
                          >
                            {user.email}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setProfileModal(true);
                            setDropdownOpen(false);
                            setProfileUsername(profile?.username || "");
                            setProfileEmail("");
                            setProfilePw1("");
                            setProfilePw2("");
                            setProfileUsernameMsg({ text: "", ok: false });
                            setProfileEmailMsg({ text: "", ok: false });
                            setProfilePwMsg({ text: "", ok: false });
                          }}
                          style={ddItemStyle}
                        >
                          👤 Личный кабинет
                        </button>
                        <button
                          onClick={doLogout}
                          style={{ ...ddItemStyle, color: "#ef7b7b" }}
                        >
                          🚪 Выйти
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setAuthModal(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    background: "var(--panel)",
                    color: "var(--text)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  🔐 Войти
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ══ MAIN GRID ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: "16px 20px",
          display: "grid",
          gridTemplateColumns: "minmax(300px,340px) minmax(0,1fr)",
          gap: 20,
          alignItems: "start",
        }}
        className="main-grid"
      >
        {/* Hero art (full width) */}
        <div
          style={{
            gridColumn: "1 / -1",
            position: "relative",
            minHeight: 260,
            overflow: "hidden",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "#10171b",
            boxShadow: "0 20px 70px rgba(0,0,0,.42)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg,rgba(7,10,12,.94),rgba(7,10,12,.46) 42%,rgba(7,10,12,.18) 68%,rgba(7,10,12,.72)),linear-gradient(180deg,rgba(255,255,255,.08),transparent 40%,rgba(0,0,0,.25))",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 16,
              border: "1px solid rgba(220,244,255,.22)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              maxWidth: 620,
              padding: 34,
            }}
          >
            <p
              style={{
                margin: "0 0 8px",
                color: "#8ef1a0",
                fontSize: 12,
                fontWeight: 900,
                textTransform: "uppercase",
              }}
            >
              {category.kicker}
            </p>
            <h2
              style={{
                margin: 0,
                color: "#fff7df",
                fontSize: 34,
                lineHeight: 1.08,
                fontWeight: 900,
              }}
            >
              {category.title}
            </h2>
            <p
              style={{
                maxWidth: 520,
                margin: "10px 0 0",
                color: "var(--muted)",
                lineHeight: 1.45,
                fontSize: 14,
              }}
            >
              {category.sub}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 18,
              }}
            >
              {category.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 26,
                    border: "1px solid rgba(255,255,255,.12)",
                    borderRadius: 4,
                    padding: "0 9px",
                    background: "rgba(9,13,15,.55)",
                    color: "#dce8e1",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── ASIDE (sidebar) ── */}
        <aside
          className="sticky-aside"
          style={{ position: "sticky", top: 104, ...panelStyle }}
        >
          <div style={panelHead}>{product?.name || "—"}</div>
          <div style={{ padding: 16 }}>
            {/* Qty row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "38px 1fr 38px",
                gap: 7,
                alignItems: "end",
                marginBottom: 14,
              }}
            >
              <button
                onClick={() => updateQty((product?.qty || 1) - 1)}
                style={iconBtnStyle}
              >
                −
              </button>
              <label style={labelStyle}>
                Нужно получить, шт
                <input
                  type="text"
                  inputMode="numeric"
                  value={product?.qty ?? ""}
                  onChange={(e) => updateQty(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              </label>
              <button
                onClick={() => updateQty((product?.qty || 0) + 1)}
                style={iconBtnStyle}
              >
                +
              </button>
            </div>
            <label style={{ ...labelStyle, marginBottom: 14 }}>
              Цена продажи за 1 шт
              <input
                type="text"
                inputMode="numeric"
                value={product?.sale ?? ""}
                onChange={(e) => updateSale(e.target.value)}
                style={{ marginTop: 6 }}
              />
            </label>

            {/* Stats */}
            {calc && (
              <div
                style={{
                  marginTop: 12,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,.07)",
                  borderRadius: 7,
                  background: "rgba(0,0,0,.18)",
                }}
              >
                {[
                  { label: "Выручка", val: money(calc.revenue) },
                  { label: "Себестоимость партии", val: money(calc.totalCost) },
                ].map(({ label, val }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "11px 12px",
                      borderBottom: "1px solid rgba(255,255,255,.07)",
                      fontSize: 13,
                    }}
                  >
                    <span>{label}</span>
                    <strong style={{ fontSize: 14, color: "#fff" }}>
                      {val}
                    </strong>
                  </div>
                ))}
                <div
                  style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}
                >
                  {[
                    {
                      label: "Себестоимость 1 шт",
                      badge: "теор.",
                      badgeColor: "#7ecff5",
                      badgeBg: "rgba(126,207,245,.15)",
                      val: money(theoCost),
                      valColor: "#7ecff5",
                      title: "По среднему выходу, без округления крафтов",
                    },
                    {
                      label: "Себестоимость 1 шт",
                      badge: "реал.",
                      badgeColor: "#83e092",
                      badgeBg: "rgba(131,224,146,.15)",
                      val: money(realUnit),
                      valColor: "#fff",
                      title: "С учётом округления крафтов вверх",
                    },
                  ].map(
                    ({
                      label,
                      badge,
                      badgeColor,
                      badgeBg,
                      val,
                      valColor,
                      title,
                    }) => (
                      <div
                        key={badge}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          borderBottom: "1px solid rgba(255,255,255,.04)",
                        }}
                      >
                        <span
                          style={{
                            color: "#8f9b95",
                            fontSize: 13,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          {label}
                          <em
                            title={title}
                            style={{
                              fontStyle: "normal",
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 5px",
                              borderRadius: 3,
                              cursor: "help",
                              color: badgeColor,
                              background: badgeBg,
                            }}
                          >
                            {badge}
                          </em>
                        </span>
                        <strong style={{ fontSize: 13, color: valColor }}>
                          {val}
                        </strong>
                      </div>
                    ),
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "11px 12px",
                    borderBottom: "1px solid rgba(255,255,255,.07)",
                    fontSize: 13,
                  }}
                >
                  <span>Прибыль</span>
                  <strong
                    style={{
                      fontSize: 14,
                      color: profit >= 0 ? "var(--accent-2)" : "var(--danger)",
                    }}
                  >
                    {money(profit)}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "11px 12px",
                    fontSize: 13,
                  }}
                >
                  <span>Маржа</span>
                  <strong
                    style={{
                      fontSize: 14,
                      color: margin >= 0 ? "var(--accent-2)" : "var(--danger)",
                    }}
                  >
                    {fmt(margin)}%
                  </strong>
                </div>
              </div>
            )}

            {/* Auction sale block */}
            {auctionSale?.price && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 7,
                  background: "rgba(255,159,67,.08)",
                  border: "1px solid rgba(255,159,67,.2)",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ color: "#aaa" }}>🏷 Аукцион сейчас</span>
                <span>
                  <span
                    style={{ fontWeight: 700, fontSize: 15, color: "#ff9f43" }}
                  >
                    {money(auctionSale.price)}
                  </span>{" "}
                  <span
                    style={{
                      fontSize: 12,
                      color:
                        auctionSale.price - (product?.sale || 0) >= 0
                          ? "#83e092"
                          : "#ff6b6b",
                    }}
                  >
                    {auctionSale.price - (product?.sale || 0) >= 0 ? "+" : ""}
                    {money(auctionSale.price - (product?.sale || 0))}
                  </span>
                </span>
              </div>
            )}

            <p
              style={{
                padding: "10px 11px",
                border: "1px solid rgba(214,167,66,.22)",
                borderRadius: 7,
                background: "rgba(214,167,66,.07)",
                color: "#c7b985",
                fontSize: 12,
                marginTop: 12,
                lineHeight: 1.45,
              }}
            >
              Крафты округляются вверх. Себестоимость над секциями — по среднему
              выходу.
            </p>
          </div>
        </aside>

        {/* ── RIGHT COLUMN ── */}
        <section>
          {/* Craft chain */}
          <div style={panelStyle}>
            <div
              style={{
                ...panelHead,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Цепочка крафта</span>
              <button
                onClick={loadAuction}
                style={{
                  background: "none",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  color: "var(--muted)",
                  fontSize: 12,
                  padding: "3px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    animation: auctionLoading
                      ? "spin 1s linear infinite"
                      : "none",
                  }}
                >
                  ↻
                </span>{" "}
                Обновить аукцион
              </button>
            </div>
            <div className="table-scroll">
              {calc?.sections.map((section, si) => {
                const rec = recipes[section.recipeId];
                const rows = Array.from(section.rows.values());
                return (
                  <div
                    key={section.recipeId + si}
                    style={{
                      borderTop:
                        si > 0 ? "1px solid rgba(255,255,255,.08)" : "none",
                    }}
                  >
                    <div style={sectionTitleStyle}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {rec?.name}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            color: "#7ecff5",
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "rgba(126,207,245,.1)",
                            border: "1px solid rgba(126,207,245,.2)",
                          }}
                        >
                          теор.{" "}
                          {money(costPerUnit(section.recipeId, getPriceOf, {}))}{" "}
                          / шт
                        </span>
                      </div>
                    </div>
                    <div style={sectionMetaStyle}>
                      Нужно: {fmt(section.needed)} шт &nbsp;·&nbsp; крафтов:{" "}
                      {section.crafts} &nbsp;·&nbsp; получится:{" "}
                      {fmt(section.produced)} шт &nbsp;·&nbsp; выход:{" "}
                      {fmt(rec?.output || 0)} шт
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Материал</th>
                          <th>Статус</th>
                          <th className="num">Количество</th>
                          <th className="num">Ваша цена</th>
                          <th className="num">Аукцион</th>
                          <th className="num">Итого</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, ri) => (
                          <tr key={ri}>
                            <td>{row.name}</td>
                            <td>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  minHeight: 22,
                                  border: "1px solid rgba(255,255,255,.07)",
                                  borderRadius: 4,
                                  padding: "2px 8px",
                                  background: "#21292e",
                                  color: "#cbd3cf",
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {row.type}
                              </span>
                            </td>
                            <td className="num">{fmt(row.qty)}</td>
                            <td className="num">
                              {row.buyName ? (
                                <input
                                  className="price-input"
                                  type="text"
                                  inputMode="decimal"
                                  defaultValue={getPriceOf(row.buyName)}
                                  key={activeProductId + "-" + row.buyName}
                                  onChange={(e) =>
                                    updateIngredientPrice(
                                      row.buyName,
                                      e.target.value,
                                    )
                                  }
                                />
                              ) : (
                                money(row.price)
                              )}
                            </td>
                            <td className="num">
                              {row.buyName ? (
                                auctionCell(row.buyName)
                              ) : (
                                <span style={{ color: "#444", fontSize: 12 }}>
                                  —
                                </span>
                              )}
                            </td>
                            <td className="num">{money(row.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shopping list */}
          <div style={{ marginTop: 18, ...panelStyle }}>
            <div style={panelHead}>Список закупки</div>
            {calc && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Предмет</th>
                      <th className="num">Купить, шт</th>
                      <th className="num">Цена за 1 шт</th>
                      <th className="num">Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...calc.shopping]
                      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                      .map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td className="num">{fmt(row.qty)}</td>
                          <td className="num">{money(row.price)}</td>
                          <td className="num">{money(row.qty * row.price)}</td>
                        </tr>
                      ))}
                    {(() => {
                      const energy = calc.sections.reduce(
                        (s, sec) =>
                          s + sec.crafts * recipes[sec.recipeId].energy,
                        0,
                      );
                      return (
                        <tr>
                          <td>Энергия</td>
                          <td className="num">{fmt(energy)}</td>
                          <td className="num">{money(ENERGY_PRICE)}</td>
                          <td className="num">
                            {money(energy * ENERGY_PRICE)}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "13px 15px",
                    borderTop: "1px solid rgba(255,255,255,.08)",
                    background:
                      "linear-gradient(180deg,rgba(127,208,138,.12),rgba(127,208,138,.05))",
                    color: "#eaffed",
                    fontWeight: 800,
                  }}
                >
                  <span>Итого закупка с энергией</span>
                  <span>{money(calc.totalCost)}</span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ══ AUTH MODAL ════════════════════════════════════════════════════════ */}
      {authModal && (
        <div
          className="modal-overlay open"
          onClick={(e) => e.target === e.currentTarget && setAuthModal(false)}
        >
          <div className="modal">
            <button onClick={() => setAuthModal(false)} style={modalCloseStyle}>
              ×
            </button>
            {!otpStep && !showForgot && (
              <>
                <div
                  style={{
                    display: "flex",
                    marginBottom: 22,
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  {["login", "register"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setAuthTab(tab)}
                      style={{
                        flex: 1,
                        padding: 9,
                        background: "none",
                        border: "none",
                        color:
                          authTab === tab ? "var(--accent)" : "var(--muted)",
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: "pointer",
                        borderBottom: `2px solid ${authTab === tab ? "var(--accent)" : "transparent"}`,
                        marginBottom: -1,
                        transition: "all .15s",
                      }}
                    >
                      {tab === "login" ? "Войти" : "Регистрация"}
                    </button>
                  ))}
                </div>
                {authTab === "login" ? (
                  <>
                    <FieldLabel>
                      Email{" "}
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="stalker@zone.ru"
                        style={{ marginTop: 5 }}
                      />
                    </FieldLabel>
                    <FieldLabel>
                      Пароль{" "}
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{ marginTop: 5 }}
                      />
                    </FieldLabel>
                    {loginError && <ErrSpan>{loginError}</ErrSpan>}
                    <BtnPrimary onClick={doLogin}>Войти</BtnPrimary>
                    <BtnGhost onClick={() => setShowForgot(true)}>
                      Забыл пароль
                    </BtnGhost>
                  </>
                ) : (
                  <>
                    <FieldLabel>
                      Логин (никнейм){" "}
                      <input
                        type="text"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        placeholder="stalker_zone"
                        style={{ marginTop: 5 }}
                      />
                    </FieldLabel>
                    <FieldLabel>
                      Email{" "}
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="stalker@zone.ru"
                        style={{ marginTop: 5 }}
                      />
                    </FieldLabel>
                    <FieldLabel>
                      Пароль{" "}
                      <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Минимум 8 символов"
                        style={{ marginTop: 5 }}
                      />
                    </FieldLabel>
                    {regError && <ErrSpan>{regError}</ErrSpan>}
                    <BtnPrimary onClick={doRegister}>
                      Создать аккаунт
                    </BtnPrimary>
                  </>
                )}
              </>
            )}
            {otpStep && (
              <>
                <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>
                  Подтверждение
                </h2>
                <p
                  style={{
                    margin: "0 0 22px",
                    color: "var(--muted)",
                    fontSize: 13,
                  }}
                >
                  Введи 6-значный код из письма
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "center",
                    margin: "16px 0",
                  }}
                >
                  {otpCode.map((c, i) => (
                    <input
                      key={i}
                      maxLength={1}
                      value={c}
                      style={{
                        width: 44,
                        height: 52,
                        textAlign: "center",
                        fontSize: 22,
                        fontWeight: 800,
                        borderRadius: 8,
                        padding: 0,
                      }}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(-1);
                        const next = [...otpCode];
                        next[i] = v;
                        setOtpCode(next);
                        if (v && i < 5)
                          e.target
                            .closest("div")
                            .querySelectorAll("input")
                            [i + 1]?.focus();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !otpCode[i] && i > 0)
                          e.target
                            .closest("div")
                            .querySelectorAll("input")
                            [i - 1]?.focus();
                      }}
                    />
                  ))}
                </div>
                {otpError && <ErrSpan>{otpError}</ErrSpan>}
                <BtnPrimary onClick={doVerifyOTP}>Подтвердить</BtnPrimary>
              </>
            )}
            {showForgot && !otpStep && (
              <>
                <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>
                  Сброс пароля
                </h2>
                <p
                  style={{
                    margin: "0 0 22px",
                    color: "var(--muted)",
                    fontSize: 13,
                  }}
                >
                  Введи email — пришлём ссылку для сброса
                </p>
                <FieldLabel>
                  Email{" "}
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="stalker@zone.ru"
                    style={{ marginTop: 5 }}
                  />
                </FieldLabel>
                {forgotError && <ErrSpan>{forgotError}</ErrSpan>}
                {forgotSuccess && (
                  <span
                    style={{
                      color: "var(--accent-2)",
                      fontSize: 12,
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    {forgotSuccess}
                  </span>
                )}
                <BtnPrimary onClick={doForgot}>Отправить письмо</BtnPrimary>
                <BtnGhost onClick={() => setShowForgot(false)}>
                  ← Назад
                </BtnGhost>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ PROFILE MODAL ═════════════════════════════════════════════════════ */}
      {profileModal && (
        <div
          className="modal-overlay open"
          onClick={(e) =>
            e.target === e.currentTarget && setProfileModal(false)
          }
        >
          <div
            className="modal"
            style={{
              maxWidth: 460,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
            }}
          >
            <button
              onClick={() => setProfileModal(false)}
              style={modalCloseStyle}
            >
              ×
            </button>
            <h2 style={{ margin: "0 0 4px" }}>Личный кабинет</h2>
            <p
              style={{
                margin: "0 0 16px",
                color: "var(--muted)",
                fontSize: 13,
              }}
            >
              {user?.email}
            </p>
            {[
              {
                title: "Логин",
                children: (
                  <>
                    <FieldLabel>
                      Никнейм{" "}
                      <input
                        type="text"
                        value={profileUsername}
                        onChange={(e) => setProfileUsername(e.target.value)}
                        style={{ marginTop: 4 }}
                      />
                    </FieldLabel>
                    <MsgLine msg={profileUsernameMsg} />
                    <BtnSm onClick={updateUsernameProfile}>Сохранить</BtnSm>
                  </>
                ),
              },
              {
                title: "Email",
                children: (
                  <>
                    <FieldLabel>
                      Новый email{" "}
                      <input
                        type="email"
                        value={profileEmail}
                        onChange={(e) => setProfileEmail(e.target.value)}
                        style={{ marginTop: 4 }}
                      />
                    </FieldLabel>
                    <MsgLine msg={profileEmailMsg} />
                    <BtnSm onClick={updateEmailProfile}>Сменить</BtnSm>
                  </>
                ),
              },
              {
                title: "Пароль",
                children: (
                  <>
                    <FieldLabel>
                      Новый пароль{" "}
                      <input
                        type="password"
                        value={profilePw1}
                        onChange={(e) => setProfilePw1(e.target.value)}
                        style={{ marginTop: 4 }}
                      />
                    </FieldLabel>
                    <FieldLabel>
                      Повтор{" "}
                      <input
                        type="password"
                        value={profilePw2}
                        onChange={(e) => setProfilePw2(e.target.value)}
                        style={{ marginTop: 4 }}
                      />
                    </FieldLabel>
                    <MsgLine msg={profilePwMsg} />
                    <BtnSm onClick={updatePwProfile}>Изменить</BtnSm>
                  </>
                ),
              },
            ].map(({ title, children }) => (
              <div
                key={title}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 14,
                }}
              >
                <h3
                  style={{
                    margin: "0 0 12px",
                    fontSize: 14,
                    color: "var(--muted)",
                  }}
                >
                  {title}
                </h3>
                {children}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ CHAT WIDGET ═══════════════════════════════════════════════════════ */}
      <div id="chatWidget" className={chatOpen ? "open" : ""}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: "1px solid var(--line)",
            background: "var(--panel-2)",
            borderRadius: "12px 0 0 0",
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>
            💬 Общий чат{" "}
            <span
              style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}
            >
              · {onlineCount} онлайн
            </span>
          </span>
          <button
            onClick={() => setChatOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>
        <div
          ref={chatMsgRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {chatMessages.length === 0 && (
            <p
              style={{
                color: "var(--muted)",
                fontSize: 12,
                textAlign: "center",
                margin: "auto 0",
              }}
            >
              Нет сообщений
            </p>
          )}
          {chatMessages.map((msg, i) => {
            const own = user && msg.user_id === user.id;
            const time = new Date(
              msg.created_at || Date.now(),
            ).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                key={i}
                style={{
                  maxWidth: "88%",
                  alignSelf: own ? "flex-end" : "flex-start",
                }}
              >
                {!own && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      marginBottom: 2,
                    }}
                  >
                    {msg.username || "Гость"} · {time}
                  </div>
                )}
                <div
                  style={{
                    padding: "7px 11px",
                    borderRadius: 10,
                    background: own
                      ? "rgba(120,210,139,.18)"
                      : "var(--panel-2)",
                    color: own ? "#c8f0d0" : "var(--text)",
                    display: "inline-block",
                    wordBreak: "break-word",
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  {msg.text}
                </div>
                {own && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      marginTop: 2,
                      textAlign: "right",
                    }}
                  >
                    {time}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderTop: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          {user ? (
            <>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Написать сообщение…"
                maxLength={300}
                style={{
                  flex: 1,
                  minHeight: 34,
                  borderRadius: 6,
                  fontSize: 13,
                }}
              />
              <button
                onClick={sendMessage}
                style={{
                  minHeight: 34,
                  padding: "0 12px",
                  borderRadius: 6,
                  background: "var(--accent)",
                  color: "#0f1711",
                  border: "none",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                →
              </button>
            </>
          ) : (
            <p
              style={{
                padding: 8,
                textAlign: "center",
                color: "var(--muted)",
                fontSize: 13,
                lineHeight: 1.5,
                margin: 0,
                flex: 1,
              }}
            >
              Войди в аккаунт,
              <br />
              чтобы писать в чат
            </p>
          )}
        </div>
      </div>

      {/* Chat FAB */}
      <button
        onClick={() => {
          setChatOpen((o) => !o);
          setUnread(0);
        }}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 175,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#0f1711",
          border: "none",
          fontSize: 22,
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(120,210,139,.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform .15s",
        }}
      >
        💬
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#ef7b7b",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}

// ── Shared style constants ────────────────────────────────────────────────────
const iconBtnStyle = {
  minHeight: 36,
  border: "1px solid #3a454d",
  borderRadius: 5,
  background: "#222a2f",
  color: "#f3d58a",
  fontWeight: 900,
  fontSize: 20,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
const labelStyle = {
  display: "block",
  color: "#c1cac4",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
};
const ddItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 16px",
  fontSize: 13,
  background: "none",
  border: "none",
  color: "var(--text)",
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  transition: "background .12s",
};
const modalCloseStyle = {
  position: "absolute",
  top: 14,
  right: 16,
  background: "none",
  border: "none",
  color: "var(--muted)",
  fontSize: 22,
  cursor: "pointer",
  lineHeight: 1,
  padding: 4,
};

// ── Micro-components ──────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        margin: "0 0 14px",
        color: "var(--muted)",
        fontSize: 13,
      }}
    >
      {children}
    </label>
  );
}
function ErrSpan({ children }) {
  return (
    <span
      style={{
        color: "#ef7b7b",
        fontSize: 12,
        display: "block",
        marginBottom: 8,
      }}
    >
      {children}
    </span>
  );
}
function MsgLine({ msg }) {
  if (!msg?.text)
    return (
      <span style={{ display: "block", minHeight: 16, marginBottom: 8 }} />
    );
  return (
    <span
      style={{
        color: msg.ok ? "var(--accent-2)" : "#ef7b7b",
        fontSize: 12,
        display: "block",
        marginBottom: 8,
      }}
    >
      {msg.text}
    </span>
  );
}
function BtnPrimary({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        minHeight: 40,
        borderRadius: 8,
        background: "var(--accent)",
        color: "#0f1711",
        border: "none",
        fontWeight: 800,
        fontSize: 14,
        cursor: disabled ? "default" : "pointer",
        marginTop: 4,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}
function BtnGhost({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: 36,
        borderRadius: 8,
        background: "transparent",
        color: "var(--muted)",
        border: "1px solid var(--line)",
        fontSize: 13,
        cursor: "pointer",
        marginTop: 8,
      }}
    >
      {children}
    </button>
  );
}
function BtnSm({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 32,
        padding: "0 14px",
        borderRadius: 6,
        background: "var(--panel-2)",
        border: "1px solid var(--line)",
        color: "var(--text)",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
