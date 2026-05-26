import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <style>{`
        :root {
          --bg: #0d1012; --panel: #151a1e; --panel-2: #1b2227;
          --text: #f3f5f2; --muted: #a4ada7; --line: #303941;
          --accent: #d6a742; --accent-2: #7fd08a; --danger: #f06f65;
          --input: #0b0e10;
        }
        *, *::before, *::after { box-sizing: border-box; }
        html { color-scheme: dark; }
        body {
          margin: 0;
          background: linear-gradient(180deg, rgba(214,167,66,.08), transparent 260px),
            radial-gradient(circle at 15% 0%, rgba(127,208,138,.08), transparent 330px), var(--bg);
          color: var(--text);
          font-family: "Segoe UI", Arial, Helvetica, sans-serif;
          min-height: 100vh;
        }
        input, button { font-family: inherit; }
        input {
          width: 100%; min-height: 36px; border: 1px solid #3a454d;
          border-radius: 5px; background: linear-gradient(180deg, #101417, #090b0d);
          color: #fff; font-weight: 700; outline: none; padding: 8px 10px;
          transition: border-color .15s, box-shadow .15s;
        }
        input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(214,167,66,.16); }
        button { position: relative; cursor: pointer; }
        button::after {
          content: ""; position: absolute; inset: -1px; border-radius: inherit;
          pointer-events: none; opacity: 0;
          box-shadow: 0 0 0 1px rgba(214,167,66,.38), 0 0 24px rgba(214,167,66,.28);
          transition: opacity .16s;
        }
        button:hover::after, button:focus-visible::after { opacity: 1; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 11px; border-top: 1px solid rgba(255,255,255,.07); font-size: 13px; text-align: left; vertical-align: middle; }
        th { background: rgba(255,255,255,.025); color: #8f9b95; font-size: 11px; text-transform: uppercase; letter-spacing: .35px; }
        tbody tr:nth-child(even) { background: rgba(255,255,255,.018); }
        tbody tr:hover { background: rgba(214,167,66,.055); }
        .num { text-align: right; white-space: nowrap; }
        .price-input { width: 104px !important; min-height: 30px !important; border-radius: 4px !important; color: #f9dda0 !important; text-align: right; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
        .custom-cursor,.custom-cursor-dot { position:fixed;top:0;left:0;z-index:9999;pointer-events:none;transform:translate(-50%,-50%);opacity:0;transition:opacity .16s,width .12s,height .12s; }
        .custom-cursor { width:34px;height:34px;border:1px solid rgba(214,167,66,.75);border-radius:50%;background:rgba(214,167,66,.06);box-shadow:0 0 22px rgba(214,167,66,.24);mix-blend-mode:screen; }
        .custom-cursor-dot { width:5px;height:5px;border-radius:50%;background:#f5d27b;box-shadow:0 0 12px rgba(245,210,123,.72); }
        body.cursor-ready,.cursor-ready * { cursor:none !important; }
        body.cursor-ready .custom-cursor,body.cursor-ready .custom-cursor-dot { opacity:1; }
        body.cursor-hover .custom-cursor { width:48px;height:48px;border-color:rgba(127,208,138,.95);background:rgba(127,208,138,.08); }
        body.cursor-down .custom-cursor { width:26px;height:26px; }
        @media(pointer:coarse){.custom-cursor,.custom-cursor-dot{display:none!important}}
        @keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .modal-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s;}
        .modal-overlay.open{opacity:1;pointer-events:all;}
        .modal{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:32px;width:100%;max-width:420px;transform:translateY(16px);transition:transform .2s;position:relative;box-shadow:0 24px 80px rgba(0,0,0,.6);}
        .modal-overlay.open .modal{transform:translateY(0);}
        #chatWidget{position:fixed;right:0;bottom:0;z-index:180;display:flex;flex-direction:column;width:320px;height:480px;background:var(--panel);border:1px solid var(--line);border-bottom:none;border-right:none;border-radius:12px 0 0 0;transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);box-shadow:-8px -8px 40px rgba(0,0,0,.4);}
        #chatWidget.open{transform:translateY(0);}
        @media(max-width:900px){.main-grid{grid-template-columns:1fr !important}.sticky-aside{position:static !important}.table-scroll{overflow-x:auto}.table-scroll table{min-width:680px}}
      `}</style>
    </QueryClientProvider>
  );
}
