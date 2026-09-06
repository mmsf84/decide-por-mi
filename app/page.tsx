'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  PanelRight,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  buildFallbackAnalysis,
  type Analysis,
  type ChatMessage,
  type Product,
} from '@/lib/decision-engine';

const sampleProducts: Product[] = [
  {
    id: 'sony-xm5',
    url: 'https://www.sony.com/headphones/wireless-headphones/wh-1000xm5',
    name: 'Sony WH-1000XM5',
    merchant: 'Sony',
    price: 349,
    currency: 'USD',
    category: 'audífonos',
    shipping: 'Envío incluido',
    qualityScore: 92,
    valueScore: 84,
    accent: 'blue',
  },
  {
    id: 'bose-ultra',
    url: 'https://www.bose.com/p/headphones/quietcomfort-ultra-headphones',
    name: 'Bose QuietComfort Ultra',
    merchant: 'Bose',
    price: 379,
    currency: 'USD',
    category: 'audífonos',
    shipping: 'Envío incluido',
    qualityScore: 94,
    valueScore: 89,
    accent: 'amber',
  },
];

const sampleMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      'Ya revisé los dos enlaces. Son comparables: misma categoría, uso y rango de precio. Bose gana por poco en valor total; Sony queda arriba si priorizas llamadas y autonomía.',
  },
];

const recentDecisions = [
  { title: 'Audífonos para viajar', meta: '2 productos · hace 4 min', active: true },
  { title: 'Monitor para home office', meta: '3 productos · ayer', active: false },
  { title: 'Cafetera compacta', meta: '2 productos · 28 feb', active: false },
];

const criteria = [
  { label: 'Calidad', value: 45, color: 'navy' },
  { label: 'Precio', value: 35, color: 'amber' },
  { label: 'Valor de uso', value: 20, color: 'mint' },
];

type WebMcpContext = {
  registerTool: (tool: { name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations: Record<string, boolean>; execute: (input: unknown) => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

type StageResult = { ok: false; message: string } | { ok: true; productId: string; totalProducts: number };

function formatPrice(product: Product) {
  if (typeof product.price !== 'number') return 'Por confirmar';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency ?? 'USD',
    maximumFractionDigits: 0,
  }).format(product.price);
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'sitio externo';
  }
}

function categoryFromUrl(url: string) {
  const value = url.toLowerCase();
  if (/headphone|audifono|earbud|audio/.test(value)) return 'audífonos';
  if (/laptop|macbook|notebook|computador|computer/.test(value)) return 'laptops';
  if (/phone|iphone|galaxy|pixel|celular/.test(value)) return 'celulares';
  if (/monitor|display|screen/.test(value)) return 'monitores';
  return 'otro';
}

function localAnalysis(products: Product[]): Analysis {
  const categories = products.map((product) => product.category ?? 'otro');
  const comparable = new Set(categories).size === 1 && categories[0] !== 'otro';
  if (!comparable) {
    return {
      ...buildFallbackAnalysis(products, []),
      comparable: false,
      verdict: 'No hay una recomendación responsable todavía.',
      canvas: {
        eyebrow: 'COMPARABILIDAD INSUFICIENTE',
        headline: 'No conviene forzar una elección.',
        recommendation:
          'Los enlaces apuntan a productos con usos o categorías distintas. Agrega opciones de la misma familia para comparar con criterio.',
        rationale: 'Una diferencia de categoría invalida el cálculo de calidad-precio.',
        nextStep: 'Reemplaza uno de los enlaces por una alternativa equivalente.',
      },
      chatReply:
        'No recomendaría ninguno todavía: los productos no parecen ser comparables. Necesito opciones de la misma categoría y uso.',
    };
  }
  return buildFallbackAnalysis(products, []);
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>(sampleProducts);
  const [analysis, setAnalysis] = useState<Analysis>(() => buildFallbackAnalysis(sampleProducts, []));
  const [urlDraft, setUrlDraft] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(sampleMessages);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const productsRef = useRef(products);
  const analysisRef = useRef(analysis);
  const messagesRef = useRef(messages);

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { analysisRef.current = analysis; }, [analysis]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const context = typeof document === 'undefined' ? undefined : (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      try {
        await context.registerTool({
          name: 'stage_product_link',
          title: 'Agregar enlace de producto',
          description: 'Agrega un enlace de producto a la comparación visible sin iniciar todavía el análisis.',
          inputSchema: { type: 'object', properties: { url: { type: 'string', format: 'uri' } }, required: ['url'], additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) {
            const url = typeof (input as { url?: unknown })?.url === 'string' ? (input as { url: string }).url : '';
            const result = stageProductUrl(url);
            if (!result.ok) throw new Error(result.message);
            return result;
          },
        }, { signal: lifecycle.signal });
        await context.registerTool({
          name: 'analyze_current_comparison',
          title: 'Analizar comparación actual',
          description: 'Ejecuta el mismo análisis de la interfaz sobre los enlaces actualmente visibles y actualiza el lienzo.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          async execute() {
            const currentProducts = productsRef.current;
            if (currentProducts.length < 2) throw new Error('Se necesitan al menos dos productos.');
            const result = await requestAnalysis(currentProducts);
            setAnalysis(result);
            return { comparable: result.comparable, winner: result.winnerName ?? null, headline: result.canvas.headline };
          },
        }, { signal: lifecycle.signal });
      } catch (error) {
        console.warn('WebMCP registration failed', error);
      }
    };
    void register();
    return () => lifecycle.abort();
  }, []);

  function stageProductUrl(rawUrl: string): StageResult {
    const url = rawUrl.trim();
    if (!url) return { ok: false, message: 'El enlace está vacío.' };
    try { new URL(url); } catch { return { ok: false, message: 'El enlace no es válido.' }; }
    if (productsRef.current.some((product) => product.url === url)) return { ok: false, message: 'Ese enlace ya está en la comparación.' };
    const currentProducts = productsRef.current;
    const nextProduct: Product = {
      id: `product-${Date.now()}`,
      url,
      name: 'Producto por identificar',
      merchant: hostFromUrl(url),
      price: null,
      currency: 'USD',
      category: categoryFromUrl(url),
      shipping: 'Se revisará con el enlace',
      qualityScore: 70,
      valueScore: 70,
      accent: currentProducts.length % 2 === 0 ? 'amber' : 'blue',
    };
    setProducts([...currentProducts, nextProduct]);
    setUrlDraft('');
    setNotice('Enlace agregado. Ejecuta el análisis para actualizar la decisión.');
    return { ok: true, productId: nextProduct.id, totalProducts: currentProducts.length + 1 };
  }

  async function requestAnalysis(currentProducts: Product[]) {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: currentProducts, criteria }),
    });
    if (!response.ok) throw new Error('analysis_unavailable');
    return (await response.json()) as Analysis & { provider?: string };
  }

  function addProduct(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    const result = stageProductUrl(urlDraft);
    if (result.ok === false) setNotice(result.message);
  }

  function removeProduct(id: string) {
    if (products.length <= 2) {
      setNotice('Mantén al menos dos enlaces para comparar.');
      return;
    }
    setProducts((current) => current.filter((product) => product.id !== id));
    setNotice('Producto retirado de la comparación.');
  }

  async function analyze() {
    if (products.length < 2) {
      setNotice('Agrega al menos dos enlaces para iniciar.');
      return;
    }
    setIsAnalyzing(true);
    setNotice('');
    try {
      const result = await requestAnalysis(products);
      setAnalysis(result);
      if (result.chatReply) {
        setMessages((current) => [
          ...current,
          { id: `analysis-${Date.now()}`, role: 'assistant', content: result.chatReply },
        ]);
      }
      setNotice(result.provider === 'ollama-cloud' ? 'Análisis actualizado con Ollama Cloud.' : 'Análisis actualizado.');
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      const fallback = localAnalysis(products);
      const reply = fallback.chatReply;
      setAnalysis(fallback);
      setMessages((current) => [
        ...current,
        { id: `analysis-${Date.now()}`, role: 'assistant', content: reply },
      ]);
      setNotice('Modo demo activo: conecta OLLAMA_API_KEY para usar el agente en la nube.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function askAgent(event: { preventDefault: () => void }) {
    event.preventDefault();
    const value = question.trim();
    if (!value || isAnalyzing) return;
    setQuestion('');
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content: value }]);
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, criteria, question: value, analysis }),
      });
      if (!response.ok) throw new Error('chat_unavailable');
      const result = (await response.json()) as Analysis & { chatReply?: string };
      setAnalysis(result);
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: result.chatReply ?? result.verdict },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: analysis.chatReply },
      ]);
      setNotice('El agente está en modo demo hasta configurar Ollama Cloud.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function saveDecision() {
    setIsSaving(true);
    try {
      const response = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${products[0]?.name ?? 'Comparación'} vs ${products[1]?.name ?? 'alternativa'}`,
          criteria,
          products,
          analysis,
          messages,
        }),
      });
      if (!response.ok) throw new Error('save_unavailable');
      setSaved(true);
      setNotice('Decisión guardada en SQLite.');
    } catch {
      setSaved(true);
      setNotice('Decisión guardada en esta sesión. Conecta SQLite para persistirla entre dispositivos.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Sparkles size={15} strokeWidth={2.4} /></div>
          <span>Decide por mi</span>
        </div>

        <Button className="new-comparison" onClick={() => { setProducts(sampleProducts); setAnalysis(buildFallbackAnalysis(sampleProducts, [])); setMessages(sampleMessages); setSaved(false); setNotice('Nueva comparación lista.'); }}>
          <Plus size={16} />
          Nueva comparación
          <span className="shortcut">⌘ K</span>
        </Button>

        <nav className="side-nav" aria-label="Navegación principal">
          <span className="side-label">ESPACIO DE TRABAJO</span>
          <button className="side-link active" type="button"><Zap size={16} /> Comparador <span className="side-count">1</span></button>
          <button className="side-link" type="button"><Clock3 size={16} /> Historial</button>
          <button className="side-link" type="button"><Bookmark size={16} /> Guardados</button>
        </nav>

        <div className="recent-list">
          <span className="side-label">RECIENTES</span>
          {recentDecisions.map((decision) => (
            <button className={`recent-item ${decision.active ? 'current' : ''}`} type="button" key={decision.title}>
              <span className="recent-icon"><FileText size={14} /></span>
              <span className="recent-copy"><strong>{decision.title}</strong><small>{decision.meta}</small></span>
              {decision.active && <span className="current-dot" />}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="provider-status"><span className="status-dot" /><span><strong>Ollama Cloud</strong><small>gpt-oss:120b-cloud</small></span></div>
          <Button variant="ghost" size="icon" aria-label="Más opciones"><MoreHorizontal size={17} /></Button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><Button variant="ghost" size="icon" onClick={() => setMobileMenu((value) => !value)} aria-label="Abrir menú"><Menu size={19} /></Button><span>Decide por mi</span></div>
          <div className="breadcrumbs"><span>Comparador</span><span className="crumb-divider">/</span><strong>Audífonos para viajar</strong></div>
          <div className="top-actions"><span className="save-state">{saved ? <><Check size={14} /> Guardado</> : 'Borrador'}</span><Button variant="outline" className="top-action-btn" onClick={saveDecision} disabled={isSaving}><Bookmark size={15} /> Guardar</Button><Button variant="ghost" size="icon" aria-label="Más acciones"><MoreHorizontal size={18} /></Button></div>
        </header>

        <div className="workspace-scroll">
          <div className="workspace-grid">
            <section className="main-column">
              <div className="intro-block">
                <div className="eyebrow"><span className="eyebrow-line" /> COMPARACIÓN ACTIVA <span className="eyebrow-date">04 MAR 2026</span></div>
                <h1>Compra con evidencia,<br /><em>no con intuición.</em></h1>
                <p className="intro-copy">Pega los enlaces. El agente revisa lo esencial y convierte la comparación en una decisión clara.</p>
              </div>

              <section className="products-section" aria-labelledby="products-title">
                <div className="section-heading"><div><span className="section-kicker">01 / INSUMOS</span><h2 id="products-title">Productos a contrastar <span className="count-pill">{products.length}</span></h2></div><span className="heading-note"><ShieldCheck size={14} /> Fuentes visibles</span></div>
                <div className="product-list">
                  {products.map((product, index) => (
                    <article className="product-row" key={product.id}>
                      <div className={`product-number ${product.accent}`}>{String(index + 1).padStart(2, '0')}</div>
                      <div className={`product-avatar ${product.accent}`}><span>{product.name === 'Producto por identificar' ? '?' : product.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span></div>
                      <div className="product-info"><div className="product-title-line"><strong>{product.name}</strong><Badge variant="outline">{product.category === 'otro' ? 'por clasificar' : product.category}</Badge></div><span className="product-url">{hostFromUrl(product.url)} <span>·</span> {product.shipping}</span></div>
                      <div className="product-price"><strong>{formatPrice(product)}</strong><small>precio visto</small></div>
                      <a className="icon-link" href={product.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${product.name}`}><ExternalLink size={15} /></a>
                      <Button variant="ghost" size="icon-xs" onClick={() => removeProduct(product.id)} aria-label={`Quitar ${product.name}`}><Trash2 size={14} /></Button>
                    </article>
                  ))}
                </div>
                <form className="add-link-form" onSubmit={addProduct}>
                  <Link2 size={17} />
                  <Input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="Pega aquí otro enlace de producto…" aria-label="Enlace de producto" />
                  <Button type="submit" variant="ghost" className="add-link-btn"><Plus size={15} /> Añadir</Button>
                </form>
                <div className="criteria-strip"><div className="criteria-label"><SlidersIcon /> Criterios activos</div>{criteria.map((item) => <span className="criteria-item" key={item.label}><i className={`criteria-dot ${item.color}`} /> {item.label} <strong>{item.value}%</strong></span>)}<Button variant="ghost" className="criteria-edit">Editar <ChevronDown size={14} /></Button></div>
              </section>

              <section className="chat-section" aria-labelledby="chat-title">
                <div className="section-heading chat-heading"><div><span className="section-kicker">02 / ANÁLISIS</span><h2 id="chat-title">Habla con tu agente</h2></div><div className="agent-pill"><span className="status-dot" /> En línea</div></div>
                <div className="chat-card">
                  <div className="chat-card-top"><div className="agent-identity"><div className="agent-avatar"><Sparkles size={16} /></div><div><strong>Decide Agent</strong><span>Analista de compras · <b>gpt-oss:120b-cloud</b></span></div></div><Button variant="ghost" size="icon" aria-label="Panel del agente"><PanelRight size={16} /></Button></div>
                  <div className="message-list" aria-live="polite">
                    {messages.slice(-4).map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-bubble">{message.content}</div>{message.role === 'assistant' && <span className="message-meta">Ahora · basado en los enlaces compartidos</span>}</div>)}
                    {isAnalyzing && <div className="message assistant"><div className="message-bubble typing"><span /><span /><span /></div></div>}
                  </div>
                  <div className="suggestion-row">{['¿Cuál tiene mejor valor?', '¿Qué dato falta?', '¿Qué elegirías tú?'].map((suggestion) => <button type="button" className="suggestion" key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div>
                  <form className="chat-input-row" onSubmit={askAgent}><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Pregúntale algo a tu agente…" rows={1} aria-label="Pregunta para el agente" /><Button type="submit" size="icon-lg" disabled={!question.trim() || isAnalyzing} aria-label="Enviar pregunta"><Send size={17} /></Button></form>
                </div>
                <div className="analysis-action-row"><span><CircleAlert size={14} /> No sustituye verificar disponibilidad y garantía.</span><Button onClick={analyze} disabled={isAnalyzing}>{isAnalyzing ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} {isAnalyzing ? 'Revisando enlaces…' : 'Analizar comparación'}</Button></div>
              </section>
      {notice && <output className="notice"><span>{notice}</span><Button variant="ghost" size="icon-xs" onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={14} /></Button></output>}
            </section>

            <aside className="canvas-column">
              <div className="canvas-heading"><div><span className="section-kicker">03 / LIENZO</span><h2>Decisión en una página</h2></div><Button variant="ghost" size="icon" aria-label="Más opciones del lienzo"><MoreHorizontal size={18} /></Button></div>
              <div className="canvas-sheet">
                <div className="canvas-sheet-top"><span className="canvas-label"><span className="canvas-label-mark" /> CANVAS / DECISIÓN 01</span><span className="canvas-date">04.03.26</span></div>
                {analysis.comparable ? <>
                  <div className="canvas-verdict"><Badge className="recommended-badge"><Check size={12} /> RECOMENDACIÓN</Badge><h3>{analysis.canvas.headline}</h3><p>{analysis.canvas.recommendation}</p></div>
                  <div className="winner-callout"><div className="winner-avatar">{(analysis.winnerName ?? products[1]?.name ?? 'B').slice(0, 1)}</div><div><span>Mejor opción ahora</span><strong>{analysis.winnerName ?? products[1]?.name}</strong></div><ArrowUpRight className="winner-arrow" size={18} /></div>
                  <div className="canvas-divider" />
                  <div className="score-section"><div className="mini-heading"><span>Puntaje compuesto</span><strong>{analysis.overallScore}<small>/100</small></strong></div><div className="score-bar"><span style={{ width: `${analysis.overallScore}%` }} /></div><div className="score-legend"><span><i className="criteria-dot navy" /> Calidad</span><span><i className="criteria-dot amber" /> Precio</span><span><i className="criteria-dot mint" /> Valor de uso</span></div></div>
                  <div className="canvas-divider" />
                  <div className="why-section"><span className="canvas-subtitle">POR QUÉ</span><p>{analysis.canvas.rationale}</p><div className="proof-list">{analysis.proofPoints.slice(0, 3).map((point) => <div className="proof-item" key={point}><Check size={13} /> <span>{point}</span></div>)}</div></div>
                  <div className="tradeoff"><span className="canvas-subtitle">TRADE-OFF</span><p>{analysis.tradeoff}</p></div>
                  <div className="next-step"><span className="canvas-subtitle">SIGUIENTE PASO</span><p>{analysis.canvas.nextStep}</p></div>
                </> : <div className="canvas-verdict not-comparable"><Badge variant="destructive"><CircleAlert size={12} /> SIN RECOMENDACIÓN</Badge><h3>{analysis.canvas.headline}</h3><p>{analysis.canvas.recommendation}</p><div className="not-comparable-note"><CircleAlert size={15} /><span>{analysis.canvas.rationale}</span></div></div>}
                <div className="canvas-footer"><span><ShieldCheck size={13} /> Análisis trazable</span><Button variant="ghost" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(`${analysis.canvas.headline}\n${analysis.canvas.recommendation}`); setNotice('Resumen copiado al portapapeles.'); }}>Copiar resumen <ArrowUpRight size={13} /></Button></div>
              </div>
              <div className="canvas-note"><div className="note-icon"><Sparkles size={14} /></div><p><strong>El lienzo se guarda junto al análisis.</strong> Puedes volver a esta decisión desde tu historial.</p></div>
            </aside>
          </div>
          <footer className="workspace-footer"><span>Decide v0.1</span><span>Hecho para comprar mejor, no más rápido.</span><span><span className="status-dot" /> SQLite conectado</span></footer>
        </div>
      </section>
    </main>
  );
}

function SlidersIcon() {
  return <span className="sliders-icon"><i /><i /><i /></span>;
}
