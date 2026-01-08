
import React, { useState, useEffect } from 'react';
import { AppState, GeneratedImage, HistoryItem } from './types';
import { analyzeProductImage, generateScene, generateEtsyMetadata } from './services/geminiService';
import { loginUser, registerUser, logToSheet, fetchHistory, updateSkuManually } from './services/storageService';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    user: null, originalImage: null, isAnalyzing: false, isGenerating: false, isGeneratingMetadata: false,
    productDescription: '', results: [], error: null, environment: 'outdoor', sku: '', etsyMetadata: null
  });

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [formData, setFormData] = useState({ user: '', pass: '' });
  const [isBusy, setIsBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<GeneratedImage | null>(null);
  const [refineNote, setRefineNote] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [lastSavedRowIndex, setLastSavedRowIndex] = useState<number | null>(null);
  const [isSavingSku, setIsSavingSku] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    try {
      const res = await (authMode === 'login' ? loginUser(formData.user, formData.pass) : registerUser(formData.user, formData.pass));
      if (res.status === 'success') {
        if (authMode === 'login') {
          // Gán API Key từ Backend vào môi trường runtime
          if (res.apiKey) {
            (window as any).process = (window as any).process || { env: {} };
            (window as any).process.env = (window as any).process.env || {};
            (window as any).process.env.API_KEY = res.apiKey;
          }
          setState(prev => ({ ...prev, user: { username: formData.user, role: res.role } }));
        } else {
          alert(res.message);
          setAuthMode('login');
        }
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert("Lỗi kết nối Server: " + err);
    }
    setIsBusy(false);
  };

  const loadHistory = async () => {
    if (!state.user) return;
    setIsHistoryLoading(true);
    try {
      const res = await fetchHistory(state.user.username);
      if (res.status === 'success') setHistoryItems(res.history);
    } catch (e) {}
    setIsHistoryLoading(false);
  };

  useEffect(() => { if (state.user) loadHistory(); }, [state.user]);

  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setState(prev => ({ ...prev, originalImage: ev.target?.result as string, results: [], error: null, etsyMetadata: null }));
      reader.readAsDataURL(file);
    }
  };

  const startProcess = async () => {
    if (!state.originalImage) return;
    setState(prev => ({ ...prev, isAnalyzing: true, results: [], error: null, etsyMetadata: null }));
    
    try {
      const desc = await analyzeProductImage(state.originalImage);
      setState(prev => ({ ...prev, productDescription: desc, isAnalyzing: false, isGenerating: true, isGeneratingMetadata: true }));

      // GIAI ĐOẠN 1: Tạo Master Design
      const masterUrl = await generateScene(state.originalImage, desc, 'full', 'Creating the definitive Master Architectural concept (40% soul preservation).', state.environment, true);
      const masterResult: GeneratedImage = { id: 'master', url: masterUrl, type: 'full', description: 'Bản thiết kế Master (Gốc kiến trúc)' };
      setState(prev => ({ ...prev, results: [masterResult] }));

      // GIAI ĐOẠN 2: Dùng Master Design làm gốc cho 8 ảnh còn lại
      const tasks = [
        { type: 'full' as const, context: 'Toàn cảnh khác của công trình master này.' },
        { type: 'people' as const, context: 'Người sử dụng sản phẩm gỗ thật, quay nhiều góc cận cảnh.' },
        { type: 'people' as const, context: 'Lifestyle scene, người tương tác trong không gian gỗ.' },
        { type: 'people' as const, context: 'Cận cảnh chi tiết thớ gỗ và tay người chạm vào.' },
        { type: 'construction' as const, context: 'Chi tiết khớp nối gỗ và khung sườn đang lắp ráp.' },
        { type: 'construction' as const, context: 'Công nhân đang thi công lắp đặt tại chỗ thiết kế này.' },
        { type: 'construction' as const, context: 'Cấu trúc khung kỹ thuật bên trong thớ gỗ.' },
        { type: 'construction' as const, context: 'Quá trình hoàn thiện bề mặt gỗ tại bối cảnh thực.' }
      ];

      const currentResults: GeneratedImage[] = [masterResult];
      for (let i = 0; i < tasks.length; i++) {
        try {
          const url = await generateScene(masterUrl, desc, tasks[i].type, tasks[i].context, state.environment, false);
          currentResults.push({ id: `r-${i}`, url, type: tasks[i].type, description: tasks[i].context });
          setState(prev => ({ ...prev, results: [...currentResults] }));
        } catch (e) { console.error("Error generating reference part", i); }
      }

      const finalMeta = await generateEtsyMetadata(desc);
      setState(prev => ({ ...prev, isGenerating: false, isGeneratingMetadata: false, etsyMetadata: finalMeta }));

      const logRes = await logToSheet(
        state.user!.username, state.originalImage!, desc, currentResults, state.sku, 
        finalMeta?.title || "Thiết kế Gỗ Cao Cấp", finalMeta?.description || "N/A", 
        finalMeta?.tags || "N/A", finalMeta?.materials || "N/A"
      );
      if (logRes.rowIndex) setLastSavedRowIndex(logRes.rowIndex);
      loadHistory();
    } catch (err: any) {
      setState(prev => ({ ...prev, isAnalyzing: false, isGenerating: false, error: err.message }));
    }
  };

  const downloadFinal = async (url: string, name: string) => {
    try {
      if (url.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Xử lý tải ảnh từ URL ngoại vi (Google Drive proxy)
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${name}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      // Fallback nếu CORS chặn fetch trực tiếp
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}.png`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-amber-600 selection:text-black">
      {selectedResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-300">
          <button onClick={() => { setSelectedResult(null); setRefineNote(''); }} className="absolute top-8 right-8 text-white/40 hover:text-white text-3xl transition-colors"><i className="fas fa-times"></i></button>
          <div className="max-w-7xl w-full grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 rounded-[48px] overflow-hidden border border-white/10 relative bg-black shadow-[0_0_100px_rgba(217,119,6,0.1)]">
              <img src={selectedResult.url} crossOrigin="anonymous" className="w-full h-full object-contain" alt="Preview" />
              {isRegenerating && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4">
                  <i className="fas fa-sync animate-spin text-5xl text-amber-500"></i>
                  <p className="text-[10px] uppercase font-black tracking-[0.3em] text-amber-500">Đang điều chỉnh thiết kế...</p>
                </div>
              )}
            </div>
            <div className="lg:col-span-4 flex flex-col justify-center space-y-8">
              <div className="space-y-4">
                <h3 className="text-4xl font-serif font-bold text-amber-500">Refine Design</h3>
                <p className="text-white/30 text-xs">Điều chỉnh lại ảnh dựa trên thiết kế hiện tại.</p>
              </div>
              <div className="bg-white/5 border border-white/10 p-10 rounded-[48px] space-y-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-white/40 px-2 tracking-widest">Gợi ý điều chỉnh (Prompt Adjustment):</label>
                  <textarea 
                    value={refineNote} 
                    onChange={e => setRefineNote(e.target.value)} 
                    placeholder="Vd: Thêm ánh nắng chiều ấm hơn, người mẫu quay mặt đi, thêm nhiều cây xanh bối cảnh..." 
                    className="w-full bg-black/40 border border-white/10 rounded-3xl p-6 text-sm outline-none focus:border-amber-600 min-h-[160px] text-white/80 leading-relaxed transition-all" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      setIsRegenerating(true);
                      try {
                        const newUrl = await generateScene(selectedResult.url, state.productDescription, selectedResult.type, selectedResult.description, state.environment, false, refineNote);
                        setState(p => ({ ...p, results: p.results.map(r => r.id === selectedResult.id ? { ...r, url: newUrl } : r) }));
                        setSelectedResult(p => p ? { ...p, url: newUrl } : null);
                        setRefineNote('');
                      } catch(e) { alert("Lỗi khi điều chỉnh ảnh!"); } finally { setIsRegenerating(false); }
                    }} 
                    disabled={isRegenerating} 
                    className="bg-amber-600 hover:bg-amber-500 py-5 rounded-3xl font-black text-xs uppercase text-black transition-all shadow-xl shadow-amber-600/20 active:scale-95 disabled:opacity-50"
                  >
                    REGENERATE
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); downloadFinal(selectedResult.url, `WoodDesign-${selectedResult.id}`); }} className="bg-white/10 hover:bg-white/20 py-5 rounded-3xl font-black text-xs uppercase transition-all active:scale-95">DOWNLOAD PNG</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!state.user ? (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-900/10 via-black to-black">
          <div className="max-w-md w-full bg-white/5 border border-white/10 backdrop-blur-xl p-12 rounded-[56px] shadow-2xl space-y-8 animate-in fade-in zoom-in duration-700">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-amber-600 rounded-[28px] mx-auto flex items-center justify-center shadow-2xl shadow-amber-600/20"><i className="fas fa-cubes text-3xl text-black"></i></div>
              <h2 className="text-3xl font-serif font-bold">WoodVision AI</h2>
              <p className="text-white/30 text-[10px] uppercase font-black tracking-widest">{authMode === 'login' ? 'Studio Authentication' : 'Create Studio Account'}</p>
            </div>
            <form onSubmit={handleAuth} className="space-y-4">
              <input required type="text" placeholder="Username" value={formData.user} onChange={e => setFormData({...formData, user: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-sm outline-none focus:border-amber-600 transition-all" />
              <input required type="password" placeholder="Password" value={formData.pass} onChange={e => setFormData({...formData, pass: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-sm outline-none focus:border-amber-600 transition-all" />
              <button type="submit" disabled={isBusy} className="w-full bg-amber-600 text-black py-4 rounded-2xl font-black text-xs uppercase hover:bg-amber-500 transition-all shadow-lg active:scale-95">
                {isBusy ? <i className="fas fa-sync animate-spin"></i> : (authMode === 'login' ? 'ENTER STUDIO' : 'REGISTER')}
              </button>
            </form>
            <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-[10px] font-black uppercase text-white/20 hover:text-amber-500 transition-all">
              {authMode === 'login' ? 'New here? Join the studio' : 'Already have an account? Login'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <header className="p-6 bg-black/80 backdrop-blur-2xl border-b border-white/5 flex justify-between items-center sticky top-0 z-50">
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center shadow-lg text-black cursor-pointer hover:scale-105 transition-all" onClick={() => setShowHistory(false)}><i className="fas fa-cubes text-xl"></i></div>
              <h1 className="text-xl font-serif font-bold hidden md:block">WoodVision <span className="text-amber-500 text-[9px] uppercase font-black tracking-widest ml-2">Advanced Studio</span></h1>
              <button onClick={() => setShowHistory(!showHistory)} className={`px-8 py-2.5 rounded-full text-[10px] font-black uppercase border transition-all ${showHistory ? 'bg-amber-600 text-black border-amber-600 shadow-lg shadow-amber-600/20' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                {showHistory ? 'Trở lại Design' : 'Lịch sử thiết kế'}
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-5 py-2 bg-white/5 rounded-full border border-white/5">
                <span className="text-[9px] font-black uppercase text-white/40 tracking-widest">User: <span className="text-white">{state.user?.username}</span></span>
              </div>
              <button onClick={() => setState(p => ({ ...p, user: null }))} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-amber-600 transition-all"><i className="fas fa-power-off"></i></button>
            </div>
          </header>

          <main className="max-w-[1700px] mx-auto w-full p-6 lg:p-12">
            {showHistory ? (
              <div className="space-y-12 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-10">
                  <h2 className="text-6xl font-serif font-bold">Archives <span className="text-amber-600">.</span></h2>
                  <div className="relative">
                    <i className="fas fa-search absolute left-6 top-1/2 -translate-y-1/2 text-white/20"></i>
                    <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Tìm kiếm theo SKU ID..." className="bg-white/5 border border-white/10 pl-14 pr-8 py-4 rounded-2xl outline-none focus:border-amber-600 text-sm min-w-[350px] transition-all" />
                  </div>
                </div>
                <div className="grid gap-12">
                  {historyItems.filter(item => item.sku.toLowerCase().includes(historySearch.toLowerCase())).map((item, idx) => (
                    <div key={idx} className="bg-[#0a0a0a] border border-white/5 rounded-[56px] p-10 grid lg:grid-cols-12 gap-12 group hover:border-amber-600/20 transition-all shadow-xl">
                      <div className="lg:col-span-3 space-y-6">
                        <div className="aspect-square rounded-[40px] overflow-hidden border border-white/10 bg-black group-hover:border-white/20 transition-all relative">
                          <img src={item.originalImage} crossOrigin="anonymous" className="w-full h-full object-contain" alt="Original" />
                          <button 
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); downloadFinal(item.originalImage, `Original-${item.sku}`); }}
                            className="absolute bottom-4 right-4 w-10 h-10 bg-black/60 backdrop-blur-md rounded-xl flex items-center justify-center text-amber-500 hover:bg-amber-600 hover:text-black transition-all shadow-xl"
                          >
                            <i className="fas fa-download"></i>
                          </button>
                        </div>
                        <div className="px-4">
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] font-black uppercase text-amber-500 tracking-widest">SKU: {item.sku}</span>
                          </div>
                          <h4 className="font-bold text-sm leading-relaxed">{item.etsyTitle}</h4>
                          <p className="text-white/20 text-[10px] uppercase mt-4 flex items-center gap-2"><i className="fas fa-calendar-alt"></i> {item.time}</p>
                        </div>
                      </div>
                      <div className="lg:col-span-9">
                        <div className="grid grid-cols-5 md:grid-cols-9 gap-2 mb-10">
                          {item.results.map((url, rIdx) => (
                            <div key={rIdx} className="relative aspect-square rounded-xl overflow-hidden border border-white/5 bg-black cursor-zoom-in group/img" onClick={() => setSelectedResult({id: `h-${idx}-${rIdx}`, url, type: 'full', description: `Archived Design #${rIdx+1}`})}>
                              <img src={url} crossOrigin="anonymous" className="w-full h-full object-cover group-hover/img:scale-110 duration-500 transition-transform" alt="Res" />
                              <div className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity z-20">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); downloadFinal(url, `Archive-${item.sku}-${rIdx + 1}`); }} 
                                  className="w-8 h-8 bg-black/60 backdrop-blur-md rounded-lg flex items-center justify-center text-white hover:bg-amber-600 hover:text-black transition-all shadow-lg"
                                  title="Tải ảnh xuống"
                                >
                                  <i className="fas fa-download text-[10px]"></i>
                                </button>
                              </div>
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                                <i className="fas fa-search-plus text-amber-500"></i>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="bg-black/50 p-10 rounded-[40px] border border-white/5 whitespace-pre-line text-[11px] text-white/50 leading-relaxed font-mono border-l-4 border-l-amber-600 shadow-inner">
                          {item.etsyDescription}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid lg:grid-cols-12 gap-16">
                <div className="lg:col-span-4 space-y-10">
                  <section className="bg-white/5 border border-white/10 rounded-[64px] p-12 space-y-10 sticky top-36 shadow-2xl animate-in slide-in-from-left-12 duration-700">
                    <h2 className="text-3xl font-serif font-bold">New Project</h2>
                    <div onDrop={e => { e.preventDefault(); processFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} className="relative aspect-square rounded-[48px] border-2 border-dashed border-white/10 bg-black flex items-center justify-center cursor-pointer group transition-all hover:border-amber-600/40 overflow-hidden shadow-inner">
                      <input type="file" id="up" className="hidden" onChange={e => e.target.files && processFile(e.target.files[0])} />
                      <label htmlFor="up" className="w-full h-full flex flex-col items-center justify-center text-center p-10 z-10">
                        {state.originalImage ? (
                          <img src={state.originalImage} className="w-full h-full object-contain" alt="Root" />
                        ) : (
                          <>
                            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6 group-hover:bg-amber-600/10 transition-colors">
                              <i className="fas fa-camera text-3xl text-white/10 group-hover:text-amber-500 transition-colors"></i>
                            </div>
                            <p className="text-[10px] uppercase font-black text-white/20 tracking-widest leading-relaxed">Kéo thả hoặc tải ảnh<br/>Sản phẩm gỗ gốc</p>
                          </>
                        )}
                      </label>
                    </div>

                    <div className="space-y-6">
                      <label className="text-[10px] font-black uppercase text-white/40 px-2 tracking-widest">Environment Choice</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setState({...state, environment: 'indoor'})} className={`py-4 rounded-3xl text-[10px] font-black uppercase transition-all border ${state.environment === 'indoor' ? 'bg-amber-600 text-black border-amber-600 shadow-lg shadow-amber-600/10' : 'bg-white/5 border-white/10 text-white/40'}`}>Trong nhà</button>
                        <button onClick={() => setState({...state, environment: 'outdoor'})} className={`py-4 rounded-3xl text-[10px] font-black uppercase transition-all border ${state.environment === 'outdoor' ? 'bg-amber-600 text-black border-amber-600 shadow-lg shadow-amber-600/10' : 'bg-white/5 border-white/10 text-white/40'}`}>Ngoài trời</button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase text-white/40 px-2 tracking-widest">SKU / Project ID</label>
                      <div className="relative flex gap-3">
                        <input value={state.sku} onChange={e => setState({...state, sku: e.target.value})} placeholder="Vd: WOOD-PRO-77" className="flex-1 bg-black/60 border border-white/10 px-6 py-5 rounded-3xl outline-none focus:border-amber-600 text-sm transition-all" />
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!lastSavedRowIndex) return;
                            setIsSavingSku(true);
                            try { await updateSkuManually(lastSavedRowIndex, state.sku); loadHistory(); alert("Đã cập nhật SKU thành công!"); } catch(e){} finally { setIsSavingSku(false); }
                          }} 
                          disabled={!lastSavedRowIndex || isSavingSku} 
                          className="w-16 bg-white/5 hover:bg-amber-600 hover:text-black rounded-3xl flex items-center justify-center transition-all disabled:opacity-20 shadow-lg active:scale-95"
                        >
                          {isSavingSku ? <i className="fas fa-sync animate-spin"></i> : <i className="fas fa-save"></i>}
                        </button>
                      </div>
                    </div>

                    <button onClick={startProcess} disabled={!state.originalImage || state.isGenerating} className="w-full py-7 rounded-[32px] bg-amber-600 text-black font-black text-lg shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:scale-100">
                      {state.isGenerating || state.isAnalyzing ? <><i className="fas fa-sync animate-spin mr-3"></i> PROCESSING STUDIO</> : "START MASTER DESIGN"}
                    </button>
                  </section>
                </div>

                <div className="lg:col-span-8 space-y-20">
                  <div className="border-b border-white/5 pb-16 flex flex-col md:flex-row md:items-end justify-between gap-10">
                    <div className="space-y-4">
                      <h2 className="text-7xl font-serif font-bold">Design Output <span className="text-amber-600">.</span></h2>
                      <p className="text-white/30 text-xl font-light">Quy trình 2 bước: Redesign Master & Phối cảnh liên kết.</p>
                    </div>
                  </div>

                  {state.etsyMetadata && (
                    <div className="bg-white/5 border border-white/10 rounded-[64px] p-16 space-y-16 animate-in slide-in-from-bottom-12 duration-1000 shadow-2xl relative overflow-hidden group/meta">
                      <div className="absolute top-0 right-0 p-10 opacity-5 group-hover/meta:opacity-20 transition-opacity"><i className="fas fa-shop text-9xl"></i></div>
                      <div className="flex items-center justify-between border-b border-white/10 pb-12 relative z-10">
                        <div className="flex items-center gap-8">
                          <div className="w-20 h-20 bg-amber-600/10 rounded-3xl flex items-center justify-center text-amber-600 shadow-inner border border-amber-600/20"><i className="fas fa-bullseye text-3xl"></i></div>
                          <h3 className="text-5xl font-serif font-bold">SEO Content <span className="text-amber-500 font-sans text-xs align-middle ml-4 bg-amber-600/10 px-4 py-1 rounded-full uppercase tracking-widest">Etsy Market</span></h3>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${state.etsyMetadata?.title}\n\n${state.etsyMetadata?.description}\n\nTags: ${state.etsyMetadata?.tags}`); alert("Đã sao chép nội dung SEO!"); }} className="bg-amber-600 text-black px-12 py-5 rounded-[28px] text-[10px] font-black uppercase hover:bg-amber-500 transition-all shadow-xl active:scale-95">Copy Full Listing</button>
                      </div>
                      <div className="grid gap-16 relative z-10">
                        <div className="space-y-6">
                          <label className="text-[11px] font-black uppercase text-white/30 px-2 tracking-[0.3em]">Listing Title SEO</label>
                          <div className="bg-black/40 border border-white/10 p-10 rounded-[32px] text-xl font-medium leading-relaxed shadow-inner">{state.etsyMetadata.title}</div>
                        </div>
                        <div className="space-y-6">
                          <label className="text-[11px] font-black uppercase text-white/30 px-2 tracking-[0.3em]">Professional Description (Vertical)</label>
                          <div className="bg-black/60 border border-white/10 p-16 rounded-[56px] text-sm leading-[2.8] text-white/70 whitespace-pre-line font-sans border-l-8 border-l-amber-600 shadow-2xl">
                            {state.etsyMetadata.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {state.results.length > 0 && (
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
                      {state.results.map((res, i) => (
                        <div key={res.id} onClick={() => setSelectedResult(res)} className="group bg-white/5 border border-white/5 rounded-[64px] overflow-hidden cursor-zoom-in hover:border-amber-600/40 transition-all shadow-2xl hover:-translate-y-2 duration-500">
                          <div className="aspect-square relative bg-black overflow-hidden shadow-inner">
                            <img src={res.url} crossOrigin="anonymous" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[4000ms] ease-out" alt="Design Result" />
                            <div className="absolute top-10 left-10">
                              <span className="bg-black/80 backdrop-blur-3xl px-6 py-2.5 rounded-full text-[9px] font-black text-amber-500 uppercase border border-amber-500/30 tracking-[0.2em] shadow-2xl">
                                {i === 0 ? "MASTER ARCHITECTURE" : (res.type === 'full' ? "PHỐI CẢNH" : (res.type === 'people' ? "LIFESTYLE" : "KỸ THUẬT"))}
                              </span>
                            </div>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-500">
                              <div className="w-20 h-20 bg-amber-600 text-black rounded-full flex items-center justify-center shadow-2xl scale-50 group-hover:scale-100 transition-transform"><i className="fas fa-search-plus text-2xl"></i></div>
                            </div>
                          </div>
                          <div className="p-10 flex justify-between items-center bg-[#0a0a0a] border-t border-white/5">
                            <div className="space-y-1">
                              <span className="font-black text-[10px] uppercase text-white/20 tracking-[0.3em]">Design Phase</span>
                              <p className="text-[11px] font-bold text-white/60">Image 0{i+1}</p>
                            </div>
                            <button onClick={e => { e.stopPropagation(); e.preventDefault(); downloadFinal(res.url, `WoodVision-Design-${i+1}`); }} className="w-14 h-14 bg-white/5 hover:bg-amber-600 hover:text-black rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-lg"><i className="fas fa-arrow-down"></i></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </>
      )}
      
      {state.error && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] bg-red-600 text-white px-10 py-5 rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-2xl animate-bounce">
          <i className="fas fa-exclamation-triangle mr-3"></i> {state.error}
          <button onClick={() => setState({...state, error: null})} className="ml-6 opacity-40 hover:opacity-100"><i className="fas fa-times"></i></button>
        </div>
      )}
    </div>
  );
};

export default App;
