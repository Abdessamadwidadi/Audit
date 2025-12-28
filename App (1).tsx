
import React, { useState, useEffect, useMemo } from 'react';
import { TimeEntry, ServiceType, Collaborator, Folder, Notification, UserRole } from './types';
import TimeEntryForm from './components/TimeEntryForm';
import Dashboard from './components/Dashboard';
import EntityModal from './components/EntityModal';
import { 
  LayoutDashboard, Clock, List, 
  Users, FolderOpen, Trash2, Edit3, UserCircle, LogOut, 
  PlusCircle, Search, Settings, Database, RefreshCw, CheckCircle2, Plus, AlertTriangle, Copy, Terminal, XCircle, Cloud, CloudOff, Wifi, WifiOff, Share2, Link as LinkIcon, Github, Globe, Send, HelpCircle, ArrowRight, ShieldCheck, Laptop, FileCode, Check
} from 'lucide-react';
import { exportToExcelCSV } from './services/csvService';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORE = {
  ENTRIES: 'audittrack_v5_entries',
  COLLABS: 'audittrack_v5_collabs',
  FOLDERS: 'audittrack_v5_folders',
  USER_ID: 'audittrack_v5_userid',
  CLOUD_CONFIG: 'audittrack_cloud_config'
};

const SQL_SETUP_SCRIPT = `-- SCRIPT DE RÉPARATION (COPIER/COLLER DANS SUPABASE)
DROP TABLE IF EXISTS "time_entries";
DROP TABLE IF EXISTS "folders";
DROP TABLE IF EXISTS "collaborators";

CREATE TABLE "collaborators" ("id" text PRIMARY KEY, "name" text NOT NULL, "department" text NOT NULL, "hiringDate" text, "role" text DEFAULT 'Collaborateur');
CREATE TABLE "folders" ("id" text PRIMARY KEY, "name" text NOT NULL, "number" text NOT NULL, "clientName" text, "serviceType" text NOT NULL, "budgetHours" numeric DEFAULT 0);
CREATE TABLE "time_entries" ("id" text PRIMARY KEY, "collaboratorId" text REFERENCES "collaborators"("id") ON DELETE CASCADE, "collaboratorName" text, "service" text, "folderId" text REFERENCES "folders"("id") ON DELETE CASCADE, "folderName" text, "folderNumber" text, "duration" numeric NOT NULL, "description" text, "date" text NOT NULL);

ALTER TABLE "collaborators" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "folders" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "time_entries" DISABLE ROW LEVEL SECURITY;

INSERT INTO "collaborators" ("id", "name", "department", "hiringDate", "role")
VALUES ('admin-1', 'Manager Cabinet', 'Audit', '2025-01-01', 'Admin') ON CONFLICT ("id") DO NOTHING;`;

const App: React.FC = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(localStorage.getItem(STORE.USER_ID));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [view, setView] = useState<'log' | 'dashboard' | 'entries' | 'collabs' | 'folders' | 'settings'>('log');
  const [isLoading, setIsLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  
  const [cloudConfig, setCloudConfig] = useState<{url: string, key: string} | null>(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#cloud:')) {
      try {
        const decoded = JSON.parse(atob(hash.substring(7)));
        if (decoded.url && decoded.key) {
          localStorage.setItem(STORE.CLOUD_CONFIG, JSON.stringify(decoded));
          window.location.hash = '';
          return decoded;
        }
      } catch (e) {
        console.error("Lien invalide");
      }
    }
    const saved = localStorage.getItem(STORE.CLOUD_CONFIG);
    return saved ? JSON.parse(saved) : null;
  });

  const supabase = useMemo(() => {
    if (cloudConfig?.url && cloudConfig?.key && cloudConfig.url.startsWith('http')) {
      try {
        return createClient(cloudConfig.url, cloudConfig.key);
      } catch (e) { return null; }
    }
    return null;
  }, [cloudConfig]);

  const isCloudActive = !!supabase;

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (supabase) {
        const { data: cData } = await supabase.from('collaborators').select('*');
        const { data: fData } = await supabase.from('folders').select('*');
        const { data: eData } = await supabase.from('time_entries').select('*').order('date', { ascending: false });
        if (cData) setCollaborators(cData);
        if (fData) setFolders(fData);
        if (eData) setEntries(eData);
        if (cData && cData.length === 0) {
           const admin = { id: 'admin-1', name: 'Manager Cabinet', department: ServiceType.AUDIT, hiringDate: '2025-01-01', role: UserRole.ADMIN };
           await supabase.from('collaborators').insert([admin]);
           setCollaborators([admin]);
        }
      } else {
        const savedCollabs = localStorage.getItem(STORE.COLLABS);
        const savedFolders = localStorage.getItem(STORE.FOLDERS);
        const savedEntries = localStorage.getItem(STORE.ENTRIES);
        setCollaborators(savedCollabs ? JSON.parse(savedCollabs) : [{ id: 'admin-1', name: 'Manager Cabinet', department: ServiceType.AUDIT, hiringDate: '2025-01-01', role: UserRole.ADMIN }]);
        setFolders(savedFolders ? JSON.parse(savedFolders) : []);
        setEntries(savedEntries ? JSON.parse(savedEntries) : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [supabase]);

  const testConnection = async () => {
    if (!cloudConfig?.url || !cloudConfig?.key) return;
    setTestStatus('loading');
    try {
      const tempClient = createClient(cloudConfig.url, cloudConfig.key);
      const { error } = await tempClient.from('collaborators').select('id').limit(1);
      if (error) throw error;
      setTestStatus('success');
      localStorage.setItem(STORE.CLOUD_CONFIG, JSON.stringify(cloudConfig));
      addNotification("Cloud configuré avec succès !", "success");
    } catch (err) {
      setTestStatus('error');
      addNotification("Erreur : Vérifiez vos clés Supabase", "warning");
    }
  };

  const getMagicLink = () => {
    if (!cloudConfig) return '';
    const encoded = btoa(JSON.stringify(cloudConfig));
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#cloud:${encoded}`;
  };

  const currentUser = collaborators.find(c => String(c.id) === String(currentUserId));
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const handleLogin = (id: string) => {
    setCurrentUserId(String(id));
    localStorage.setItem(STORE.USER_ID, String(id));
  };

  const handleLogout = () => {
    setCurrentUserId(null);
    localStorage.removeItem(STORE.USER_ID);
    setView('log');
  };

  const addTimeEntry = async (data: any) => {
    if (!currentUserId || !currentUser) return;
    const folder = folders.find(f => String(f.id) === String(data.folderId));
    if (!folder) return;

    const newEntry: TimeEntry = {
      id: `entry_${Date.now()}`,
      collaboratorId: currentUser.id,
      collaboratorName: currentUser.name,
      service: folder.serviceType,
      folderId: folder.id,
      folderName: folder.name,
      folderNumber: folder.number,
      duration: data.duration,
      description: data.description,
      date: data.date
    };

    if (supabase) {
      await supabase.from('time_entries').insert([newEntry]);
      fetchData();
    } else {
      const updated = [newEntry, ...entries];
      setEntries(updated);
      localStorage.setItem(STORE.ENTRIES, JSON.stringify(updated));
    }
    addNotification("Saisie enregistrée", "success");
  };

  const saveEntity = async (type: 'collab' | 'folder', data: any) => {
    const table = type === 'collab' ? 'collaborators' : 'folders';
    const entity = { ...data, id: data.id || `${type === 'collab' ? 'c' : 'f'}_${Date.now()}` };

    if (supabase) {
      await supabase.from(table).upsert([entity]);
      fetchData();
    } else {
      if (type === 'collab') {
        const updated = data.id ? collaborators.map(c => c.id === data.id ? entity : c) : [...collaborators, entity];
        setCollaborators(updated);
        localStorage.setItem(STORE.COLLABS, JSON.stringify(updated));
      } else {
        const updated = data.id ? folders.map(f => f.id === data.id ? entity : f) : [...folders, entity];
        setFolders(updated);
        localStorage.setItem(STORE.FOLDERS, JSON.stringify(updated));
      }
    }
    setEntityModal(null);
    addNotification("Sauvegardé", "success");
  };

  const addNotification = (message: string, type: 'info' | 'warning' | 'success' = 'info') => {
    setNotifications([{ id: Date.now().toString(), message, type, timestamp: new Date().toLocaleTimeString() }, ...notifications].slice(0, 3));
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [entityModal, setEntityModal] = useState<{type: 'collab' | 'folder', data?: any} | null>(null);

  const visibleEntries = entries.filter(e => isAdmin ? true : String(e.collaboratorId) === String(currentUserId));

  if (!currentUserId) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-8 right-8">
            <button onClick={() => setView('settings')} className="px-6 py-4 bg-slate-900/50 text-slate-400 rounded-2xl hover:text-white transition-all flex items-center gap-2 border border-slate-800 backdrop-blur-md font-bold text-xs uppercase">
              <Settings size={18}/> {view === 'settings' ? 'Retour à l\'Accueil' : 'Guide de Mise en Ligne'}
            </button>
        </div>

        {view === 'settings' ? (
          <div className="bg-white p-10 rounded-[3rem] w-full max-w-5xl shadow-2xl animate-in zoom-in duration-300 overflow-y-auto max-h-[90vh] hide-scrollbar relative">
             <div className="mb-12 text-center">
                <h3 className="text-4xl font-black text-slate-900 mb-2">Guide de Mise en Ligne (A à Z)</h3>
                <p className="text-slate-400 font-bold">Suivez ces étapes pour transformer ce code en une application réelle pour vos collaborateurs.</p>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* PARTIE GAUCHE : LES FICHIERS */}
                <div className="space-y-6">
                  <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100">
                    <h4 className="font-black text-xs uppercase tracking-widest mb-6 text-slate-500 flex items-center gap-2"><FileCode size={16}/> 1. Vos Fichiers Source</h4>
                    <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">Vous devez copier le code de cette discussion dans des fichiers sur votre ordinateur avec ces noms exacts :</p>
                    <ul className="space-y-2">
                       <li className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white p-2 rounded-lg border border-slate-200"><Check size={14} className="text-emerald-500"/> App.tsx (Le cerveau)</li>
                       <li className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white p-2 rounded-lg border border-slate-200"><Check size={14} className="text-emerald-500"/> types.ts (Le dictionnaire)</li>
                       <li className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white p-2 rounded-lg border border-slate-200"><Check size={14} className="text-emerald-500"/> index.html & index.tsx (Le moteur)</li>
                    </ul>
                  </div>

                  <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100">
                    <h4 className="font-black text-xs uppercase tracking-widest mb-6 text-indigo-900 flex items-center gap-2"><Github size={16}/> 2. Envoi sur GitHub</h4>
                    <p className="text-[11px] text-indigo-700 mb-4 leading-relaxed">Créez un dépôt sur GitHub et glissez-déposez vos fichiers directement dans la fenêtre de votre navigateur.</p>
                    <a href="https://github.com/new" target="_blank" className="block w-full py-4 bg-indigo-600 text-white font-black rounded-2xl text-[10px] uppercase text-center shadow-lg shadow-indigo-200">Créer mon dépôt GitHub</a>
                  </div>
                </div>

                {/* PARTIE DROITE : MISE EN LIGNE */}
                <div className="space-y-6">
                  <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100">
                    <h4 className="font-black text-xs uppercase tracking-widest mb-6 text-emerald-900 flex items-center gap-2"><Globe size={16}/> 3. Publication Vercel</h4>
                    <p className="text-[11px] text-emerald-700 mb-4 leading-relaxed">Connectez votre GitHub à Vercel. Votre application aura alors une adresse web (ex: audit.vercel.app).</p>
                    <a href="https://vercel.com/new" target="_blank" className="block w-full py-4 bg-emerald-600 text-white font-black rounded-2xl text-[10px] uppercase text-center shadow-lg shadow-emerald-200">Déployer sur Vercel</a>
                  </div>

                  <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white">
                    <h4 className="font-black text-xs uppercase tracking-widest mb-6 text-indigo-400 flex items-center gap-2"><Database size={16}/> 4. Coffre-fort Supabase</h4>
                    <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">Une fois en ligne, configurez ici vos clés Supabase pour que tout le monde enregistre au même endroit.</p>
                    <div className="space-y-3">
                      <input className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-[10px] font-mono text-white outline-none" value={cloudConfig?.url || ''} onChange={e => setCloudConfig(prev => ({url: e.target.value.trim(), key: prev?.key || ''}))} placeholder="URL Supabase" />
                      <input className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-[10px] font-mono text-white outline-none" value={cloudConfig?.key || ''} onChange={e => setCloudConfig(prev => ({url: prev?.url || '', key: e.target.value.trim()}))} placeholder="Clé API" />
                      <button onClick={testConnection} className="w-full py-3 bg-indigo-500 text-white font-black rounded-xl text-[10px] uppercase">{testStatus === 'loading' ? 'Vérification...' : 'Activer le Cloud'}</button>
                    </div>
                  </div>
                </div>
             </div>

             {/* PARTAGE AUX COLLABS */}
             {isCloudActive && (
               <div className="mt-12 bg-amber-50 p-10 rounded-[3rem] border-2 border-dashed border-amber-200 text-center">
                  <h4 className="text-xl font-black text-amber-900 mb-4 flex items-center justify-center gap-3"><Send /> 5. Partage aux Collaborateurs</h4>
                  <p className="text-sm text-amber-800 mb-8 max-w-2xl mx-auto">Votre plateforme est prête ! Copiez ce lien et envoyez-le à votre équipe. Ils n'auront rien à configurer.</p>
                  <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-3xl border border-amber-200 max-w-2xl mx-auto">
                    <p className="flex-grow text-[10px] font-mono text-amber-600 truncate text-left px-2">{getMagicLink()}</p>
                    <button 
                      onClick={() => { navigator.clipboard.writeText(getMagicLink()); addNotification("Lien magique copié !", "success"); }}
                      className="px-8 py-4 bg-amber-500 text-white font-black rounded-2xl text-[10px] uppercase whitespace-nowrap"
                    >
                      Copier le lien magique
                    </button>
                  </div>
               </div>
             )}

             <div className="mt-12 pt-8 border-t border-slate-100 flex justify-center">
                <button onClick={() => setView('log')} className="text-slate-400 font-black text-xs uppercase hover:text-red-500 transition-all flex items-center gap-2">
                  <XCircle size={18}/> Fermer le guide
                </button>
             </div>
          </div>
        ) : (
          <div className="max-w-5xl w-full text-center">
            <div className="inline-block bg-indigo-600 p-8 rounded-[3rem] shadow-2xl mb-10 border-4 border-indigo-400/20"><Clock size={56} className="text-white" /></div>
            <h1 className="text-8xl font-black text-white tracking-tighter mb-4">AuditTrack</h1>
            <div className="flex items-center justify-center gap-3 mb-20">
              {isCloudActive ? (
                <span className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-400/10 px-6 py-3 rounded-full border border-emerald-400/20 shadow-[0_0_20px_rgba(52,211,153,0.1)]"><Wifi size={16} className="animate-pulse"/> Infrastructure Cloud Connectée</span>
              ) : (
                <span className="flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-[0.2em] bg-amber-400/10 px-6 py-3 rounded-full border border-amber-400/20"><WifiOff size={16}/> Mode Travail Local Uniquement</span>
              )}
            </div>

            {isLoading ? (
              <div className="py-20 flex flex-col items-center">
                <RefreshCw size={48} className="animate-spin text-indigo-500 mb-6" />
                <p className="text-slate-400 font-bold tracking-widest uppercase text-xs">Ouverture des dossiers...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {collaborators.map(c => (
                  <button key={c.id} onClick={() => handleLogin(c.id)} className="group bg-slate-900/40 border border-slate-800 p-10 rounded-[3rem] text-left transition-all hover:bg-indigo-600 hover:border-indigo-400 hover:-translate-y-2 shadow-2xl hover:shadow-indigo-500/20">
                    <UserCircle size={40} className="text-indigo-400 group-hover:text-white mb-6 transition-colors" />
                    <h3 className="text-2xl font-black text-white">{c.name}</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2 group-hover:text-indigo-200 transition-colors">{c.department}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f8fafc]">
      <aside className="w-full md:w-80 bg-[#0f172a] text-white p-10 flex flex-col shrink-0">
        <div className="flex items-center gap-4 mb-12 px-2">
          <div className="bg-indigo-600 p-4 rounded-2xl shadow-2xl shadow-indigo-500/30"><Clock size={32}/></div>
          <h1 className="text-3xl font-black tracking-tighter">AuditTrack</h1>
        </div>

        <div className="mb-10 p-8 bg-slate-800/40 rounded-[2.5rem] border border-slate-700/50">
           <div className="flex justify-between items-start mb-6">
             <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">{currentUser?.department}</p>
                <p className="text-xl font-black truncate text-white">{currentUser?.name}</p>
             </div>
             {isCloudActive ? <Cloud size={18} className="text-emerald-400" /> : <CloudOff size={18} className="text-amber-500" />}
           </div>
           <button onClick={handleLogout} className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-red-400 transition-all font-mono"><LogOut size={14} /> Quitter la session</button>
        </div>

        <nav className="space-y-2 flex-grow">
          <button onClick={() => setView('log')} className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl transition-all ${view === 'log' ? 'bg-indigo-600 shadow-xl' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
            <PlusCircle size={22} /> <span className="font-black text-sm">Saisir Heures</span>
          </button>
          <button onClick={() => setView('entries')} className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl transition-all ${view === 'entries' ? 'bg-indigo-600 shadow-xl' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
            <List size={22} /> <span className="font-black text-sm">Mon Historique</span>
          </button>

          {isAdmin && (
            <>
              <div className="h-px bg-slate-800 my-8"></div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-6 mb-4">Espace Manager</p>
              <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-slate-800 shadow-lg text-indigo-400' : 'text-slate-400 hover:text-white'}`}><LayoutDashboard size={22} /> <span className="font-black text-sm">Analytics</span></button>
              <button onClick={() => setView('folders')} className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl transition-all ${view === 'folders' ? 'bg-slate-800 shadow-lg text-indigo-400' : 'text-slate-400 hover:text-white'}`}><FolderOpen size={22} /> <span className="font-black text-sm">Dossiers</span></button>
              <button onClick={() => setView('collabs')} className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl transition-all ${view === 'collabs' ? 'bg-slate-800 shadow-lg text-indigo-400' : 'text-slate-400 hover:text-white'}`}><Users size={22} /> <span className="font-black text-sm">Équipe</span></button>
            </>
          )}
        </nav>

        <button onClick={() => setView('settings')} className="mt-10 flex items-center gap-3 px-6 py-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 hover:text-white transition-all">
          <Settings size={18} /> <span className="text-[10px] font-black uppercase">Réglages Cloud</span>
        </button>
      </aside>

      <main className="flex-grow p-8 md:p-16 overflow-y-auto max-h-screen hide-scrollbar">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 mb-16">
          <div>
            <h2 className="text-6xl font-black text-slate-900 tracking-tighter">
              {view === 'log' ? 'Saisie Hebdo' : view === 'entries' ? 'Rapports' : view === 'collabs' ? 'Staff' : view === 'folders' ? 'Portfolio' : 'Configuration'}
            </h2>
          </div>
          {isAdmin && (view === 'collabs' || view === 'folders') && (
             <button onClick={() => setEntityModal({type: view === 'collabs' ? 'collab' : 'folder'})} className="px-12 py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xs shadow-2xl hover:-translate-y-1 transition-all uppercase tracking-widest">Ajouter</button>
          )}
        </header>

        <div className="max-w-7xl mx-auto space-y-12 pb-32">
          {view === 'log' && <TimeEntryForm collaborators={collaborators} folders={isAdmin ? folders : folders.filter(f => f.serviceType === currentUser?.department)} currentCollabId={currentUserId!} onAddEntry={addTimeEntry} />}
          {view === 'dashboard' && <Dashboard entries={entries} folders={folders} />}
          
          {(view === 'collabs' || view === 'folders') && (
            <div className="bg-white rounded-[3.5rem] border border-slate-200 overflow-hidden shadow-sm">
               { (view === 'collabs' ? collaborators : folders).length === 0 ? (
                 <div className="p-24 text-center flex flex-col items-center">
                    <AlertTriangle size={64} className="text-amber-400 mb-8" />
                    <h3 className="text-3xl font-black text-slate-800 mb-3">Aucune donnée</h3>
                    <button onClick={() => setEntityModal({type: view === 'collabs' ? 'collab' : 'folder'})} className="px-10 py-5 bg-indigo-600 text-white rounded-3xl font-black text-xs shadow-xl uppercase tracking-widest">Initialiser</button>
                 </div>
               ) : (
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-400 border-b">
                      <tr><th className="p-10">Libellé</th><th className="p-10">Département</th><th className="p-10 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {(view === 'collabs' ? collaborators : folders).map((item: any) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-all group">
                          <td className="p-10 font-black text-slate-900 text-lg">{item.name} {item.number && <span className="text-indigo-600 opacity-50">#{item.number}</span>}</td>
                          <td className="p-10"><span className="px-5 py-2.5 bg-slate-100 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest">{item.department || item.serviceType}</span></td>
                          <td className="p-10 text-right">
                             <div className="flex justify-end gap-3">
                               <button onClick={() => setEntityModal({type: view === 'collabs' ? 'collab' : 'folder', data: item})} className="p-4 bg-white text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 shadow-sm transition-all"><Edit3 size={20}/></button>
                               <button onClick={async () => {
                                 if (!confirm("Effacer cet élément ?")) return;
                                 if (supabase) {
                                   await supabase.from(view === 'collabs' ? 'collaborators' : 'folders').delete().eq('id', item.id);
                                   fetchData();
                                 } else {
                                   if (view === 'collabs') setCollaborators(collaborators.filter(c => c.id !== item.id));
                                   else setFolders(folders.filter(f => f.id !== item.id));
                                 }
                               }} className="p-4 bg-white text-slate-400 hover:text-red-500 rounded-2xl border border-slate-100 shadow-sm transition-all"><Trash2 size={20}/></button>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               )}
            </div>
          )}

          {view === 'entries' && (
            <div className="bg-white rounded-[3.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-10 border-b bg-slate-50/50 flex flex-col md:flex-row gap-6">
                 <div className="relative flex-grow">
                   <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={22}/>
                   <input type="text" className="w-full pl-16 pr-6 py-5 rounded-3xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold" placeholder="Filtrer mes rapports..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                 </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-400 border-b">
                    <tr><th className="p-10">Date d'exécution</th><th className="p-10">Mission</th><th className="p-10">Temps</th><th className="p-10 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {visibleEntries.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50/80 transition-all group">
                        <td className="p-10 font-bold text-slate-400 font-mono text-xs">{e.date}</td>
                        <td className="p-10">
                          <p className="font-black text-slate-900">{e.folderName}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{e.service}</p>
                        </td>
                        <td className="p-10"><span className="bg-indigo-50 text-indigo-600 px-5 py-2.5 rounded-2xl font-black text-xs border border-indigo-100">{e.duration}h</span></td>
                        <td className="p-10 text-right">
                           <button onClick={async () => {
                             if (!confirm("Supprimer cette ligne ?")) return;
                             if (supabase) {
                               await supabase.from('time_entries').delete().eq('id', e.id);
                               fetchData();
                             } else {
                               setEntries(entries.filter(x => x.id !== e.id));
                             }
                           }} className="p-4 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={20}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {entityModal && <EntityModal type={entityModal.type} initialData={entityModal.data} onSave={(data) => saveEntity(entityModal.type, data)} onClose={() => setEntityModal(null)} />}
      </main>

      <div className="fixed bottom-10 right-10 flex flex-col gap-3 z-[300]">
        {notifications.map(n => (
          <div key={n.id} className={`p-6 rounded-[2rem] shadow-2xl border-l-8 flex items-center gap-5 animate-in slide-in-from-right min-w-[350px] backdrop-blur-xl ${n.type === 'success' ? 'bg-emerald-50/90 border-emerald-500 text-emerald-900' : 'bg-amber-50/90 border-amber-500 text-amber-900'}`}>
             {n.type === 'success' ? <CheckCircle2 className="text-emerald-500" size={24}/> : <AlertTriangle className="text-amber-500" size={24}/>}
             <div>
               <p className="font-black text-sm tracking-tight">{n.message}</p>
               <p className="text-[9px] font-bold uppercase opacity-50">{n.timestamp}</p>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
