import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Route, Switch, Link, Router as WouterRouter, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import NotFound from '@/pages/not-found';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  Bell, CalendarClock, Check, CheckCircle2, ChevronDown, CircleDot, Clock3,
  Command, FilePlus2, Filter, Headphones, LifeBuoy, ListTodo, MessageSquareText,
  Search, ShieldCheck, Sparkles, Ticket, X,
} from 'lucide-react';

type Priority = 'High' | 'Medium' | 'Low';
type TicketStatus = 'New' | 'In Progress' | 'Resolved';
type IssueType = 'Technical' | 'Billing' | 'General';
type TaskStatus = 'Not Started' | 'In Progress' | 'Completed';
type SupportTicket = {
  id: string; ticketNumber: string; accountName: string; contactName: string;
  issueType: IssueType; description: string; priority: Priority; status: TicketStatus;
  createdAt: string; assignedTo: string; slaBreachRisk: boolean; resolutionHours: number | null;
};
type UrgentTask = { id: string; ticketId: string; subject: string; status: TaskStatus; priority: 'High'; createdAt: string };
type Store = { version: number; tickets: SupportTicket[]; tasks: UrgentTask[] };
type TicketCreate = { accountName: string; contactName: string; issueType: IssueType; description: string };
const STORAGE_KEY = 'support-ticket-intelligence:v1';
const DATA_VERSION = 1;

function classify(description: string): Priority {
  const text = description.toLowerCase();
  if (['urgent', 'not working', 'failure'].some((rule) => text.includes(rule))) return 'High';
  if (['issue', 'slow', 'delay'].some((rule) => text.includes(rule))) return 'Medium';
  return 'Low';
}
function assignment(priority: Priority) {
  if (priority === 'High') return 'Senior Support Agent';
  if (priority === 'Medium') return 'Priority Support Team';
  return 'General Support Queue';
}
function recalculateRisk(ticket: SupportTicket, now = Date.now()): SupportTicket {
  const ageHours = (now - new Date(ticket.createdAt).getTime()) / 3_600_000;
  return { ...ticket, slaBreachRisk: ticket.status !== 'Resolved' && ageHours > 48 };
}
function makeTask(ticket: SupportTicket): UrgentTask {
  return {
    id: `task-${ticket.id}`, ticketId: ticket.id, subject: `Urgent Ticket Handling · ${ticket.ticketNumber}`,
    status: 'Not Started', priority: 'High', createdAt: ticket.createdAt,
  };
}
function seedStore(): Store {
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const raw: SupportTicket[] = [
    { id: 't-1048', ticketNumber: 'ST-1048', accountName: 'Northstar Health', contactName: 'Maya Chen', issueType: 'Technical', description: 'Urgent: patient intake portal is not working across all clinics.', priority: 'High', status: 'In Progress', createdAt: ago(6), assignedTo: 'Senior Support Agent', slaBreachRisk: false, resolutionHours: null },
    { id: 't-1047', ticketNumber: 'ST-1047', accountName: 'Juniper & Co.', contactName: 'Elliot Park', issueType: 'Billing', description: 'There is an issue with our latest invoice and two duplicate charges.', priority: 'Medium', status: 'New', createdAt: ago(13), assignedTo: 'Priority Support Team', slaBreachRisk: false, resolutionHours: null },
    { id: 't-1046', ticketNumber: 'ST-1046', accountName: 'Northstar Health', contactName: 'Rosa Alvarez', issueType: 'Technical', description: 'Failure when exporting monthly patient records.', priority: 'High', status: 'New', createdAt: ago(52), assignedTo: 'Senior Support Agent', slaBreachRisk: true, resolutionHours: null },
    { id: 't-1045', ticketNumber: 'ST-1045', accountName: 'Fieldwork Studio', contactName: 'Noah Williams', issueType: 'General', description: 'Could you share the steps to invite a new teammate?', priority: 'Low', status: 'Resolved', createdAt: ago(74), assignedTo: 'General Support Queue', slaBreachRisk: false, resolutionHours: 3.4 },
    { id: 't-1044', ticketNumber: 'ST-1044', accountName: 'Juniper & Co.', contactName: 'Priya Desai', issueType: 'Technical', description: 'The reporting dashboard has been slow since yesterday.', priority: 'Medium', status: 'In Progress', createdAt: ago(29), assignedTo: 'Priority Support Team', slaBreachRisk: false, resolutionHours: null },
    { id: 't-1043', ticketNumber: 'ST-1043', accountName: 'Atlas Freight', contactName: 'Jon Bell', issueType: 'Billing', description: 'Please update the billing contact on our account.', priority: 'Low', status: 'Resolved', createdAt: ago(112), assignedTo: 'General Support Queue', slaBreachRisk: false, resolutionHours: 8.1 },
  ];
  const tickets = raw.map(recalculateRisk);
  return { version: DATA_VERSION, tickets, tasks: tickets.filter((ticket) => ticket.priority === 'High').map(makeTask) };
}
function loadStore(): Store {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return seedStore();
    const parsed = JSON.parse(saved) as Store;
    if (parsed.version !== DATA_VERSION || !Array.isArray(parsed.tickets) || !Array.isArray(parsed.tasks)) return seedStore();
    const tickets = parsed.tickets.map(recalculateRisk);
    const tasks = [...parsed.tasks];
    tickets.filter((ticket) => ticket.priority === 'High').forEach((ticket) => {
      if (!tasks.some((task) => task.ticketId === ticket.id)) tasks.push(makeTask(ticket));
    });
    return { version: DATA_VERSION, tickets, tasks };
  } catch {
    return seedStore();
  }
}

type DataContextValue = {
  tickets: SupportTicket[]; tasks: UrgentTask[];
  createTicket: (values: TicketCreate) => SupportTicket;
  updateTicketStatus: (id: string, status: TicketStatus) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
};
const DataContext = createContext<DataContextValue | null>(null);
function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error('Ticket data is not available');
  return value;
}
function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => loadStore());
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }, [store]);
  const context = useMemo<DataContextValue>(() => ({
    tickets: store.tickets, tasks: store.tasks,
    createTicket: (values) => {
      const priority = classify(values.description);
      const ticket: SupportTicket = {
        ...values, id: `t-${Date.now()}`, ticketNumber: `ST-${String(Math.max(...store.tickets.map((t) => Number(t.ticketNumber.slice(3)) || 1000), 1048) + 1)}`,
        priority, status: 'New', createdAt: new Date().toISOString(), assignedTo: assignment(priority),
        slaBreachRisk: false, resolutionHours: null,
      };
      setStore((current) => ({
        ...current, tickets: [ticket, ...current.tickets],
        tasks: priority === 'High' && !current.tasks.some((task) => task.ticketId === ticket.id) ? [makeTask(ticket), ...current.tasks] : current.tasks,
      }));
      return ticket;
    },
    updateTicketStatus: (id, status) => setStore((current) => ({
      ...current, tickets: current.tickets.map((ticket) => ticket.id === id ? recalculateRisk({ ...ticket, status }) : ticket),
    })),
    updateTaskStatus: (id, status) => setStore((current) => ({
      ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, status } : task),
    })),
  }), [store]);
  return <DataContext.Provider value={context}>{children}</DataContext.Provider>;
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: Activity },
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/tasks', label: 'Urgent tasks', icon: ListTodo },
  { href: '/assistant', label: 'Account lookup', icon: MessageSquareText },
];
function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { tickets, tasks } = useData();
  const activeCount = tasks.filter((task) => task.status !== 'Completed').length;
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand" data-testid="link-brand">
          <span className="brand-icon"><LifeBuoy size={20} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>Relay</strong><small>SUPPORT INTELLIGENCE</small></span>
        </Link>
        <div className="workspace-label">WORKSPACE <span className="workspace-dot" /></div>
        <nav aria-label="Main navigation" className="side-nav">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon size={17} strokeWidth={1.9} /><span>{label}</span>
              {label === 'Urgent tasks' && activeCount > 0 && <span className="nav-count">{activeCount}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note"><ShieldCheck size={16} /><div><strong>Local demo</strong><span>Saved in this browser</span></div><span className="live-dot" /></div>
          <div className="agent-chip"><div className="agent-avatar">SA</div><div><strong>Support Agent</strong><small>Operations desk</small></div><ChevronDown size={15} /></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Support operations</span><span className="crumb-slash">/</span><strong>{navItems.find((item) => item.href === location)?.label || 'Workspace'}</strong></div>
          <div className="topbar-right">
            <span className="sample-chip"><span /> SAMPLE DATA · LOCAL ONLY</span>
            <button type="button" className="icon-button" aria-label="View open tickets" onClick={() => navigate('/tickets')} data-testid="button-activity-indicator"><Bell size={17} /><i>{tickets.filter((ticket) => ticket.status !== 'Resolved').length}</i></button>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge priority-${priority.toLowerCase()}`} data-testid={`status-priority-${priority.toLowerCase()}`}><span className="badge-dot" />{priority}</span>;
}
function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge status-${status.toLowerCase().replaceAll(' ', '-')}`} data-testid={`status-ticket-${status.toLowerCase().replaceAll(' ', '-')}`}><span className="badge-dot" />{status}</span>;
}
function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge task-${status.toLowerCase().replaceAll(' ', '-')}`} data-testid={`status-task-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>;
}
function formatRelative(date: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function Metric({ label, value, note, icon: Icon, tone, trend }: { label: string; value: string | number; note: string; icon: typeof Ticket; tone: string; trend?: 'up' | 'down' }) {
  return <div className="metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div>
    <div className="metric-value">{value}</div>
    <div className="metric-note">{trend === 'up' ? <ArrowUpRight size={14} /> : trend === 'down' ? <ArrowDownRight size={14} /> : null}{note}</div>
  </div>;
}
function Dashboard() {
  const { tickets, tasks } = useData();
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const open = tickets.filter((ticket) => ticket.status !== 'Resolved');
  const risk = open.filter((ticket) => recalculateRisk(ticket).slaBreachRisk);
  const high = tickets.filter((ticket) => ticket.priority === 'High');
  const distribution = (['High', 'Medium', 'Low'] as Priority[]).map((priority) => ({ priority, count: tickets.filter((ticket) => ticket.priority === priority).length }));
  const recent = [...tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  return <div className="page-enter">
    <PageHeading eyebrow="TUESDAY, SUPPORT DESK" title="Good morning, team." subtitle="A clear read on the queue, the risks, and what needs attention next." action={<Link href="/tickets" className="button button-primary" data-testid="button-create-ticket"><FilePlus2 size={16} />New ticket</Link>} />
    <section className="metric-grid">
      <Metric label="Open tickets" value={open.length} note={`${tickets.length} total in the queue`} icon={Ticket} tone="teal" />
      <Metric label="High priority" value={high.filter((ticket) => ticket.status !== 'Resolved').length} note={`${tasks.filter((task) => task.status !== 'Completed').length} handling tasks open`} icon={AlertTriangle} tone="coral" trend="up" />
      <Metric label="SLA at risk" value={risk.length} note={risk.length ? 'Unresolved for more than 48 hours' : 'All unresolved tickets within window'} icon={Clock3} tone="amber" />
      <Metric label="Resolved" value={tickets.filter((ticket) => ticket.status === 'Resolved').length} note="Across the current sample" icon={CheckCircle2} tone="blue" />
    </section>
    <section className="dashboard-grid">
      <div className="panel queue-panel">
        <div className="panel-heading"><div><span className="section-kicker">QUEUE SNAPSHOT</span><h2>Priority mix</h2><p>Tickets classified from their description.</p></div><span className="outline-icon"><Activity size={18} /></span></div>
        <div className="priority-mix" data-testid="chart-priority-mix">
          {distribution.map(({ priority, count }) => <div className="mix-row" key={priority} data-testid={`mix-${priority.toLowerCase()}`}>
            <div className="mix-label"><PriorityBadge priority={priority} /><span>{count} {count === 1 ? 'ticket' : 'tickets'}</span></div>
            <div className="mix-track"><div className={`mix-fill fill-${priority.toLowerCase()}`} style={{ width: `${tickets.length ? Math.max(count / tickets.length * 100, count ? 8 : 0) : 0}%` }} /></div>
            <span className="mix-percent">{tickets.length ? Math.round(count / tickets.length * 100) : 0}%</span>
          </div>)}
        </div>
        <div className="queue-foot"><span><span className="mini-dot coral-dot" />High takes precedence in rule matching</span><Link href="/tickets" className="text-link" data-testid="link-view-all-tickets">View all tickets <ArrowRight size={14} /></Link></div>
      </div>
      <div className={`panel risk-panel ${risk.length ? 'risk-active' : ''}`}>
        <div className="panel-heading"><div><span className="section-kicker">SERVICE WINDOW</span><h2>SLA watch</h2></div><span className="outline-icon warn"><CalendarClock size={18} /></span></div>
        {risk.length ? <>
          <div className="risk-count"><strong>{risk.length}</strong><span>ticket{risk.length === 1 ? '' : 's'} beyond the 48-hour window</span></div>
          <div className="risk-list">{risk.slice(0, 2).map((ticket) => <div className="risk-item" key={ticket.id}><span className="risk-marker" /><div><strong>{ticket.ticketNumber} · {ticket.accountName}</strong><small>{ticket.contactName} · {formatRelative(ticket.createdAt)}</small></div><PriorityBadge priority={ticket.priority} /></div>)}</div>
        </> : <div className="risk-clear"><span className="clear-mark"><Check size={19} /></span><div><strong>No tickets at risk</strong><span>Unresolved tickets are inside the 48-hour SLA window.</span></div></div>}
        <div className="risk-foot"><AlertCircle size={14} />Risk is calculated locally from ticket age and status.</div>
      </div>
    </section>
    <section className="panel recent-panel">
      <div className="panel-heading recent-head"><div><span className="section-kicker">LATEST MOVEMENT</span><h2>Recent tickets</h2></div><Link href="/tickets" className="text-link" data-testid="link-recent-tickets">Open ticket queue <ArrowRight size={14} /></Link></div>
      <TicketTable tickets={recent} onSelect={setSelected} compact />
    </section>
    <div className="logic-strip"><span className="logic-icon"><Command size={16} /></span><span><strong>Explicit rules, no black box.</strong> Priority is based on description keywords; ownership and SLA watch are determined in this browser.</span><Link href="/assistant" className="text-link" data-testid="link-account-lookup">Look up an account <ArrowRight size={14} /></Link></div>
    <TicketModal ticket={selected} onClose={() => setSelected(null)} onStatus={(status) => setSelected((current) => current ? recalculateRisk({ ...current, status }) : current)} />
  </div>;
}

function TicketTable({ tickets, onSelect, compact = false }: { tickets: SupportTicket[]; onSelect: (ticket: SupportTicket) => void; compact?: boolean }) {
  if (!tickets.length) return <div className="empty-state"><span className="empty-icon"><Ticket size={21} /></span><strong>No tickets match</strong><span>Try changing your search or filters.</span></div>;
  return <div className="table-wrap"><table className="ticket-table">
    <thead><tr><th>Ticket</th><th>Account / contact</th><th>Priority</th><th>Status</th>{!compact && <th>Assigned to</th>}<th>{compact ? 'Opened' : 'SLA'}</th></tr></thead>
    <tbody>{tickets.map((ticket) => <tr key={ticket.id} onClick={() => onSelect(ticket)} className="ticket-row" data-testid={`row-ticket-${ticket.id}`} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(ticket); }}>
      <td><span className="ticket-code">{ticket.ticketNumber}</span><small className="ticket-issue">{ticket.issueType} · {ticket.description.slice(0, 46)}{ticket.description.length > 46 ? '…' : ''}</small></td>
      <td><strong className="account-name">{ticket.accountName}</strong><small>{ticket.contactName}</small></td>
      <td><PriorityBadge priority={ticket.priority} /></td><td><StatusBadge status={ticket.status} /></td>
      {!compact && <td><span className="assignee"><span className="assignee-avatar">{ticket.assignedTo.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>{ticket.assignedTo}</span></td>}
      <td>{compact ? <span className="date-text">{formatRelative(ticket.createdAt)}</span> : ticket.slaBreachRisk ? <span className="risk-label"><AlertTriangle size={13} />At risk</span> : <span className="date-text">{ticket.status === 'Resolved' ? 'Resolved' : 'On track'}</span>}</td>
    </tr>)}</tbody>
  </table></div>;
}
function TicketModal({ ticket, onClose, onStatus }: { ticket: SupportTicket | null; onClose: () => void; onStatus: (status: TicketStatus) => void }) {
  const { updateTicketStatus } = useData();
  if (!ticket) return null;
  return <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-detail-heading" data-testid={`dialog-ticket-${ticket.id}`}>
      <div className="modal-top"><span className="eyebrow">TICKET DETAIL · {ticket.ticketNumber}</span><button className="icon-button" onClick={onClose} aria-label="Close ticket details" data-testid="button-close-ticket"><X size={18} /></button></div>
      <div className="modal-title-row"><h2 id="ticket-detail-heading">{ticket.accountName}</h2><PriorityBadge priority={ticket.priority} /></div>
      <p className="modal-contact">{ticket.contactName} · {ticket.issueType} · Opened {formatRelative(ticket.createdAt)}</p>
      <div className="detail-description"><span className="section-kicker">CUSTOMER DESCRIPTION</span><p>{ticket.description}</p></div>
      <div className="detail-grid"><div><span>Assigned to</span><strong>{ticket.assignedTo}</strong></div><div><span>SLA status</span><strong className={ticket.slaBreachRisk ? 'text-danger' : ''}>{ticket.slaBreachRisk ? 'At risk · over 48 hours' : ticket.status === 'Resolved' ? 'Closed' : 'Within window'}</strong></div><div><span>Ticket status</span><StatusBadge status={ticket.status} /></div><div><span>Resolution time</span><strong>{ticket.resolutionHours ? `${ticket.resolutionHours} hours` : 'Not resolved'}</strong></div></div>
      <div className="modal-actions"><label htmlFor="detail-status">Update status</label><select id="detail-status" value={ticket.status} onChange={(event) => { const status = event.target.value as TicketStatus; updateTicketStatus(ticket.id, status); onStatus(status); }} data-testid="select-ticket-status"><option>New</option><option>In Progress</option><option>Resolved</option></select><button className="button button-outline" onClick={onClose} data-testid="button-done-ticket">Done</button></div>
    </section>
  </div>;
}
function TicketsPage() {
  const { tickets, createTicket } = useData();
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All priorities');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const filtered = tickets.filter((ticket) => {
    const query = search.trim().toLowerCase();
    const matches = !query || [ticket.ticketNumber, ticket.accountName, ticket.contactName, ticket.description].some((value) => value.toLowerCase().includes(query));
    return matches && (priorityFilter === 'All priorities' || ticket.priority === priorityFilter) && (statusFilter === 'All statuses' || ticket.status === statusFilter);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div className="page-enter">
    <PageHeading eyebrow="CUSTOMER QUEUE" title="Tickets" subtitle="Search the queue, review the context, and move each issue forward." action={<button className="button button-primary" onClick={() => setCreateOpen(true)} data-testid="button-new-ticket"><FilePlus2 size={16} />Create ticket</button>} />
    <div className="tickets-toolbar">
      <label className="search-field"><Search size={16} /><input type="search" placeholder="Search tickets, accounts, contacts…" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-ticket-search" /><kbd>/</kbd></label>
      <label className="select-field"><Filter size={14} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Filter by priority" data-testid="filter-priority"><option>All priorities</option><option>High</option><option>Medium</option><option>Low</option></select></label>
      <label className="select-field"><CircleDot size={14} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" data-testid="filter-status"><option>All statuses</option><option>New</option><option>In Progress</option><option>Resolved</option></select></label>
      <span className="results-count">{filtered.length} of {tickets.length} tickets</span>
    </div>
    <section className="panel tickets-panel"><TicketTable tickets={filtered} onSelect={setSelected} /></section>
    <div className="classification-note"><Sparkles size={16} /><span><strong>Rule-based classification.</strong> High: “urgent”, “not working”, “failure” · Medium: “issue”, “slow”, “delay” · otherwise Low. High matches always take precedence.</span></div>
    <TicketModal ticket={selected} onClose={() => setSelected(null)} onStatus={(status) => setSelected((current) => current ? recalculateRisk({ ...current, status }) : current)} />
    {createOpen && <CreateTicketDialog onClose={() => setCreateOpen(false)} onCreate={(values) => { const ticket = createTicket(values); setCreateOpen(false); setSelected(ticket); }} />}
  </div>;
}
function CreateTicketDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (values: TicketCreate) => void }) {
  const form = useForm<TicketCreate>({ defaultValues: { accountName: '', contactName: '', issueType: 'Technical', description: '' } });
  const submit = form.handleSubmit((values) => onCreate({ ...values, accountName: values.accountName.trim(), contactName: values.contactName.trim(), description: values.description.trim() }));
  return <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ticket-modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-heading">
      <div className="modal-top"><span className="eyebrow">NEW CUSTOMER ISSUE</span><button className="icon-button" onClick={onClose} aria-label="Close create ticket form" data-testid="button-close-create"><X size={18} /></button></div>
      <h2 id="create-heading">Create a ticket</h2><p className="create-intro">Add the customer's words as they reported them. Priority and ownership are assigned from explicit keyword rules.</p>
      <Form {...form}><form onSubmit={submit} className="create-form">
        <div className="form-two">
          <FormField control={form.control} name="accountName" rules={{ required: 'Account name is required' }} render={({ field }) => <FormItem><FormLabel>Account name</FormLabel><FormControl><input {...field} placeholder="e.g. Northstar Health" data-testid="input-create-account" /></FormControl><FormMessage /></FormItem>} />
          <FormField control={form.control} name="contactName" rules={{ required: 'Contact name is required' }} render={({ field }) => <FormItem><FormLabel>Contact name</FormLabel><FormControl><input {...field} placeholder="Customer contact" data-testid="input-create-contact" /></FormControl><FormMessage /></FormItem>} />
        </div>
        <FormField control={form.control} name="issueType" render={({ field }) => <FormItem><FormLabel>Issue type</FormLabel><FormControl><select {...field} data-testid="select-create-issue"><option>Technical</option><option>Billing</option><option>General</option></select></FormControl></FormItem>} />
        <FormField control={form.control} name="description" rules={{ required: 'Describe the customer issue', minLength: { value: 8, message: 'Add a little more detail (at least 8 characters)' } }} render={({ field }) => <FormItem><FormLabel>Issue description</FormLabel><FormControl><textarea {...field} rows={4} placeholder="What happened? Include the customer's own words." data-testid="input-create-description" /></FormControl><FormMessage /></FormItem>} />
        <div className="form-rule"><ShieldCheck size={15} /><span>Saved on this device. High priority creates a visible handling task automatically.</span></div>
        <div className="form-actions"><button type="button" className="button button-outline" onClick={onClose} data-testid="button-cancel-create">Cancel</button><button type="submit" className="button button-primary" data-testid="button-submit-ticket"><FilePlus2 size={15} />Create ticket</button></div>
      </form></Form>
    </section>
  </div>;
}

function TasksPage() {
  const { tasks, tickets, updateTaskStatus } = useData();
  const sorted = [...tasks].sort((a, b) => (a.status === 'Completed' ? 1 : 0) - (b.status === 'Completed' ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  return <div className="page-enter">
    <PageHeading eyebrow="PRIORITY WORKFLOW" title="Urgent handling" subtitle="Every high-priority ticket gets a single task so critical work stays visible." action={<span className="task-summary"><span className="live-dot" />{tasks.filter((task) => task.status !== 'Completed').length} active</span>} />
    <div className="task-intro"><div className="task-intro-icon"><AlertTriangle size={20} /></div><div><strong>High priority needs a human next step.</strong><span>Tasks are created when a high-priority ticket is added. Update progress here; task state is saved locally.</span></div></div>
    <section className="task-list" data-testid="list-urgent-tasks">
      {!sorted.length ? <div className="panel empty-task"><span className="empty-icon"><ListTodo size={22} /></span><strong>No urgent tasks</strong><span>When a ticket matches a high-priority rule, its handling task will appear here.</span><Link href="/tickets" className="button button-outline" data-testid="link-create-high-ticket">Go to tickets <ArrowRight size={14} /></Link></div> :
      sorted.map((task) => {
        const ticket = tickets.find((item) => item.id === task.ticketId);
        const nextStatus: TaskStatus = task.status === 'Not Started' ? 'In Progress' : task.status === 'In Progress' ? 'Completed' : 'Not Started';
        const actionLabel = task.status === 'Not Started' ? 'Start task' : task.status === 'In Progress' ? 'Mark complete' : 'Reopen task';
        return <article className={`task-card ${task.status === 'Completed' ? 'task-complete' : ''}`} key={task.id} data-testid={`card-task-${task.id}`}>
          <div className="task-card-mark">{task.status === 'Completed' ? <Check size={18} /> : <AlertTriangle size={18} />}</div>
          <div className="task-main"><div className="task-card-top"><span className="ticket-code">{ticket?.ticketNumber || task.ticketId}</span><TaskStatusBadge status={task.status} /><PriorityBadge priority="High" /></div>
            <h2>{task.subject}</h2><p>{ticket ? `${ticket.accountName} · ${ticket.contactName}` : 'Ticket details unavailable'}</p>
            <div className="task-context"><span><Clock3 size={14} />Created {formatRelative(task.createdAt)}</span><span><Headphones size={14} />{ticket?.assignedTo ?? 'Senior Support Agent'}</span>{ticket?.slaBreachRisk && <span className="risk-label"><AlertTriangle size={13} />SLA at risk</span>}</div>
          </div>
          <div className="task-action"><button className={`button ${task.status === 'Completed' ? 'button-outline' : 'button-primary'}`} onClick={() => updateTaskStatus(task.id, nextStatus)} data-testid={`button-task-${task.status === 'Completed' ? 'reopen' : task.status === 'Not Started' ? 'start' : 'complete'}-${task.id}`}>{task.status === 'Completed' ? <ArrowUpRight size={15} /> : task.status === 'In Progress' ? <Check size={15} /> : <ArrowRight size={15} />}{actionLabel}</button></div>
        </article>;
      })}
    </section>
    <div className="task-footnote"><CheckCircle2 size={15} />A ticket can have one urgent task only. Task progress does not change ticket status.</div>
  </div>;
}

type LookupResult = { ticket: SupportTicket; message: string } | null;
function AssistantPage() {
  const { tickets } = useData();
  const [account, setAccount] = useState('');
  const [result, setResult] = useState<LookupResult>(null);
  const [searched, setSearched] = useState(false);
  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = account.trim().toLocaleLowerCase();
    if (!query) { setResult(null); setSearched(true); return; }
    const latest = tickets.filter((ticket) => ticket.accountName.trim().toLocaleLowerCase() === query).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setResult(latest ? { ticket: latest, message: nextAction(latest) } : null);
    setSearched(true);
  }
  return <div className="page-enter assistant-page">
    <PageHeading eyebrow="ACCOUNT CONTEXT" title="Account lookup" subtitle="Enter an account name to review its most recent ticket and the next practical step." />
    <section className="assistant-layout">
      <div className="assistant-main">
        <div className="assistant-hero"><div className="assistant-mark"><MessageSquareText size={21} /></div><div><span className="section-kicker">LOCAL CASE REVIEW</span><h2>One account. The latest signal.</h2><p>Relay checks the newest matching ticket in this browser and gives you its current ownership, urgency, and next action.</p></div></div>
        <form className="lookup-form" onSubmit={lookup}>
          <label htmlFor="account-query">Account name</label>
          <div className="lookup-input-row"><div className="lookup-input"><Search size={18} /><input id="account-query" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="Try Northstar Health" data-testid="input-account-lookup" /></div><button type="submit" className="button button-primary" data-testid="button-run-lookup">Review account <ArrowRight size={16} /></button></div>
          <small>Match is case-insensitive and exact to the saved account name.</small>
        </form>
        {searched && result && <div className="lookup-result" data-testid="result-account-lookup">
          <div className="result-header"><div><span className="section-kicker">LATEST MATCH · {result.ticket.ticketNumber}</span><h3>{result.ticket.accountName}</h3><p>{result.ticket.contactName} · {formatRelative(result.ticket.createdAt)}</p></div><PriorityBadge priority={result.ticket.priority} /></div>
          <div className="result-details"><div><span>Issue</span><strong>{result.ticket.issueType}</strong></div><div><span>Assigned to</span><strong>{result.ticket.assignedTo}</strong></div><div><span>Ticket status</span><StatusBadge status={result.ticket.status} /></div><div><span>SLA risk</span><strong className={result.ticket.slaBreachRisk ? 'text-danger' : 'text-good'}>{result.ticket.slaBreachRisk ? 'At risk' : 'No'}</strong></div></div>
          <div className="result-description"><span className="section-kicker">CUSTOMER ISSUE</span><p>{result.ticket.description}</p></div>
          <div className="next-action"><span className="next-action-icon"><ArrowRight size={16} /></span><div><span className="section-kicker">NEXT ACTION</span><p>{result.message}</p></div></div>
        </div>}
        {searched && !result && <div className="lookup-empty" data-testid="message-no-match"><span className="empty-icon"><Search size={21} /></span><div><strong>{account.trim() ? 'No matching account found' : 'Enter an account name'}</strong><p>{account.trim() ? `There are no saved tickets for “${account.trim()}”. Check the spelling or create a ticket first.` : 'Add an account name above to search saved tickets.'}</p></div></div>}
        {!searched && <div className="lookup-hint"><div className="hint-mark"><Sparkles size={16} /></div><div><strong>What this review includes</strong><p>Latest ticket by creation date, rule-based priority, current assignee, SLA age check, and an action grounded in its current status.</p></div></div>}
      </div>
      <aside className="assistant-side">
        <span className="section-kicker">HOW THE REVIEW WORKS</span>
        <div className="step-list"><div className="step-item"><span>01</span><div><strong>Find the account</strong><p>Case-insensitive exact-name match in locally saved tickets.</p></div></div><div className="step-item"><span>02</span><div><strong>Choose latest ticket</strong><p>Newest creation time wins when the account has multiple issues.</p></div></div><div className="step-item"><span>03</span><div><strong>Recommend next step</strong><p>Uses ticket status, priority, ownership, and SLA risk. No external AI.</p></div></div></div>
        <div className="local-callout"><ShieldCheck size={16} /><span>This demo runs entirely in your browser. It is not connected to Salesforce or an external service.</span></div>
      </aside>
    </section>
  </div>;
}
function nextAction(ticket: SupportTicket) {
  if (ticket.status === 'Resolved') return `This ticket is resolved. No further handling is needed; confirm the customer has the resolution and keep the case closed.`;
  if (ticket.slaBreachRisk) return `Contact ${ticket.contactName} now to acknowledge the delay, then review the issue with ${ticket.assignedTo}. This unresolved ticket is beyond the 48-hour SLA window.`;
  if (ticket.priority === 'High') return `Treat this as urgent: ${ticket.assignedTo} should investigate the reported failure now and update ${ticket.contactName} with the next checkpoint.`;
  if (ticket.priority === 'Medium') return `Review the reported issue and send ${ticket.contactName} a clear update. ${ticket.assignedTo} owns the next response.`;
  return `Confirm the request with ${ticket.contactName} and respond through the standard queue. ${ticket.assignedTo} owns the next step.`;
}
function DashboardRouter() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/"><AppShell><Dashboard /></AppShell></Route>
    <Route path="/dashboard"><AppShell><Dashboard /></AppShell></Route>
    <Route path="/tickets"><AppShell><TicketsPage /></AppShell></Route>
    <Route path="/tasks"><AppShell><TasksPage /></AppShell></Route>
    <Route path="/assistant"><AppShell><AssistantPage /></AppShell></Route>
    <Route component={NotFound} />
  </Switch></ErrorBoundary>;
}
function App() {
  return <TooltipProvider><StoreProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><DashboardRouter /></WouterRouter><Toaster /></StoreProvider></TooltipProvider>;
}
export default App;