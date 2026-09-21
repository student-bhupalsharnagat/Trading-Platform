import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SupportTicket, TicketCategory, TicketPriority, TicketMessage } from '../types.ts';
import { authApi } from '../services/authApi.ts';
import { useAuth } from '../hooks/useAuth.ts';
import {
  ArrowLeft,
  Plus,
  Search,
  Paperclip,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  X,
  Star,
  Image as ImageIcon,
  Check,
  RefreshCw,
  Tag,
  ShieldAlert,
  HelpCircle,
  CreditCard,
  KeyRound,
  FileCheck,
  Activity,
} from 'lucide-react';

interface SupportTicketsSectionProps {
  onBack?: () => void;
}

const CATEGORIES: TicketCategory[] = [
  'Account & Login',
  'Trading Issues',
  'Payment & Withdrawal',
  'Technical Support',
  'General Enquiry',
  'KYC & Documents',
];

const PRIORITIES: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

const INITIAL_FALLBACK_TICKETS: SupportTicket[] = [
  {
    id: 'TKT-1042',
    subject: 'Unable to place order during market hours',
    category: 'Trading Issues',
    priority: 'High',
    status: 'IN_PROGRESS',
    createdAt: '30 Aug 2026, 09:14',
    updatedAt: '30 Aug 2026, 11:32',
    messages: [
      {
        id: 'msg-1042-1',
        sender: 'user',
        senderName: 'You',
        text: "I tried placing a GOLD FUT order at 09:10 IST but got an error saying 'Order rejected'. My account has sufficient margin.",
        time: '09:14',
        timestamp: '30 Aug 2026, 09:14',
      },
      {
        id: 'msg-1042-2',
        sender: 'support',
        senderName: 'Vertex Support',
        text: 'Hello! Thank you for reaching out. We have escalated this to our trading desk. Could you share the exact error code shown on screen?',
        time: '11:32',
        timestamp: '30 Aug 2026, 11:32',
      },
    ],
  },
  {
    id: 'TKT-1038',
    subject: 'Withdrawal pending for 3 days',
    category: 'Payment & Withdrawal',
    priority: 'Urgent',
    status: 'OPEN',
    createdAt: '27 Aug 2026, 16:45',
    updatedAt: '27 Aug 2026, 16:45',
    messages: [
      {
        id: 'msg-1038-1',
        sender: 'user',
        senderName: 'You',
        text: 'I submitted a withdrawal of ₹50,000 on 27 Aug. It has been 3 days and the amount is still not credited to my bank account.',
        time: '16:45',
        timestamp: '27 Aug 2026, 16:45',
      },
    ],
  },
  {
    id: 'TKT-1029',
    subject: 'KYC document re-submission required',
    category: 'KYC & Documents',
    priority: 'Medium',
    status: 'RESOLVED',
    createdAt: '22 Aug 2026, 10:05',
    updatedAt: '24 Aug 2026, 14:18',
    rating: 5,
    messages: [
      {
        id: 'msg-1029-1',
        sender: 'user',
        senderName: 'You',
        text: 'I received an email saying my PAN card was rejected. I have re-uploaded a clearer copy.',
        time: '10:05',
        timestamp: '22 Aug 2026, 10:05',
      },
      {
        id: 'msg-1029-2',
        sender: 'support',
        senderName: 'Vertex Support',
        text: 'Thank you for re-uploading. Your KYC has been verified and your account is now fully active. Sorry for the inconvenience.',
        time: '14:18',
        timestamp: '24 Aug 2026, 14:18',
      },
    ],
  },
];

export const SupportTicketsSection: React.FC<SupportTicketsSectionProps> = ({ onBack }) => {
  const { showToast } = useAuth();

  // Navigation mode: 'LIST' | 'CREATE' | 'DETAIL'
  const [currentView, setCurrentView] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Tickets state
  const [tickets, setTickets] = useState<SupportTicket[]>(() => {
    const cached = localStorage.getItem('vtx_support_tickets');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fallback
      }
    }
    return INITIAL_FALLBACK_TICKETS;
  });

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');

  // Create Form State
  const [category, setCategory] = useState<TicketCategory>('Trading Issues');
  const [priority, setPriority] = useState<TicketPriority>('Medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string | null>(null);
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Detail / Chat State
  const [replyText, setReplyText] = useState('');
  const [replyAttachment, setReplyAttachment] = useState<string | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [isTypingSupport, setIsTypingSupport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Save to LocalStorage whenever tickets change
  useEffect(() => {
    localStorage.setItem('vtx_support_tickets', JSON.stringify(tickets));
  }, [tickets]);

  // Fetch from server on mount
  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await authApi.getTickets();
      if (res.tickets && res.tickets.length > 0) {
        setTickets(res.tickets);
      }
    } catch (err) {
      console.warn('Using local cached tickets', err);
    } finally {
      setLoading(false);
    }
  };

  // Scroll to bottom of chat
  useEffect(() => {
    if (currentView === 'DETAIL') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentView, selectedTicketId, tickets, isTypingSupport]);

  // Selected Ticket object
  const activeTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    return tickets.find((t) => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // Summary Metrics Counters
  const counts = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === 'OPEN').length;
    const inProgress = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
    const resolved = tickets.filter((t) => t.status === 'RESOLVED').length;
    return { total, open, inProgress, resolved };
  }, [tickets]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Status filter
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = t.id.toLowerCase().includes(q);
        const matchSub = t.subject.toLowerCase().includes(q);
        const matchCat = t.category.toLowerCase().includes(q);
        const matchMsg = t.messages.some((m) => m.text.toLowerCase().includes(q));
        if (!matchId && !matchSub && !matchCat && !matchMsg) return false;
      }

      return true;
    });
  }, [tickets, statusFilter, searchQuery]);

  // Handle File Upload (Screenshot)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isReply = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast({
        type: 'error',
        title: 'File Too Large',
        description: 'Screenshot must be under 5 MB.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      if (isReply) {
        setReplyAttachment(base64);
      } else {
        setAttachedImage(base64);
        setAttachedImageName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit New Ticket
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      showToast({ type: 'error', title: 'Subject Required', description: 'Please enter a brief subject.' });
      return;
    }
    if (!description.trim()) {
      showToast({ type: 'error', title: 'Description Required', description: 'Please describe the issue.' });
      return;
    }

    setSubmittingTicket(true);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toTimeString().split(' ')[0].slice(0, 5);
    const formattedDate = `${dateStr}, ${timeStr}`;

    const newTicketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTicket: SupportTicket = {
      id: newTicketId,
      subject: subject.trim(),
      category,
      priority,
      status: 'OPEN',
      createdAt: formattedDate,
      updatedAt: formattedDate,
      attachmentUrl: attachedImage || undefined,
      attachmentName: attachedImageName || undefined,
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: 'user',
          senderName: 'You',
          text: description.trim(),
          time: timeStr,
          timestamp: formattedDate,
          attachmentUrl: attachedImage || undefined,
          attachmentName: attachedImageName || undefined,
        },
      ],
    };

    try {
      await authApi.createTicket({
        subject: newTicket.subject,
        category: newTicket.category,
        priority: newTicket.priority,
        message: description.trim(),
        attachmentUrl: attachedImage || undefined,
        attachmentName: attachedImageName || undefined,
      });
    } catch {
      // offline/demo support
    }

    setTickets((prev) => [newTicket, ...prev]);
    setSubmittingTicket(false);

    // Reset Form
    setSubject('');
    setDescription('');
    setAttachedImage(null);
    setAttachedImageName(null);
    setCategory('Trading Issues');
    setPriority('Medium');

    showToast({
      type: 'success',
      title: 'Ticket Raised Successfully',
      description: `Your ticket ${newTicketId} has been submitted.`,
    });

    // Jump to the created ticket
    setSelectedTicketId(newTicketId);
    setCurrentView('DETAIL');

    // Simulate smart support desk auto response after 3 seconds
    simulateAgentReply(newTicketId, subject, description);
  };

  // Send Reply in Conversation
  const handleSendReply = async () => {
    if (!replyText.trim() && !replyAttachment) return;
    if (!selectedTicketId) return;

    setSendingReply(true);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toTimeString().split(' ')[0].slice(0, 5);
    const formattedDate = `${dateStr}, ${timeStr}`;

    const userMessage: TicketMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      senderName: 'You',
      text: replyText.trim(),
      time: timeStr,
      timestamp: formattedDate,
      attachmentUrl: replyAttachment || undefined,
    };

    const textToSimulate = replyText.trim();
    const currentTicketId = selectedTicketId;

    // Optimistically update tickets
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === currentTicketId) {
          const nextStatus = t.status === 'RESOLVED' ? 'IN_PROGRESS' : t.status;
          return {
            ...t,
            status: nextStatus,
            updatedAt: formattedDate,
            messages: [...t.messages, userMessage],
          };
        }
        return t;
      })
    );

    setReplyText('');
    setReplyAttachment(null);
    setSendingReply(false);

    try {
      await authApi.replyTicket(currentTicketId, textToSimulate, replyAttachment || undefined);
    } catch {
      // offline support
    }

    // Trigger AI / Support desk reply simulation
    simulateAgentReply(currentTicketId, activeTicket?.subject || '', textToSimulate);
  };

  // Smart support agent reply simulation
  const simulateAgentReply = (ticketId: string, subj: string, userMsg: string) => {
    setTimeout(() => {
      setIsTypingSupport(true);
      setTimeout(() => {
        setIsTypingSupport(false);
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0].slice(0, 5);
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const formattedDate = `${dateStr}, ${timeStr}`;

        let reply =
          'Thank you for providing the details. Our trading operations specialist is reviewing your account logs and will update you shortly.';

        const lowerMsg = (userMsg + ' ' + subj).toLowerCase();
        if (lowerMsg.includes('gold') || lowerMsg.includes('order') || lowerMsg.includes('margin') || lowerMsg.includes('market')) {
          reply =
            'We checked the order routing logs. For commodity futures like GOLD FUT, please confirm order type is INTRADAY or HOLDING within official MCX hours (09:00 - 23:30 IST). Our technical desk has logged this incident.';
        } else if (lowerMsg.includes('withdraw') || lowerMsg.includes('50,000') || lowerMsg.includes('bank') || lowerMsg.includes('payment')) {
          reply =
            'We have verified the IMPS payout batch with our banking partner. The funds have been cleared from our node and should reflect in your account within 30-60 minutes. Transaction UTR has been generated.';
        } else if (lowerMsg.includes('pan') || lowerMsg.includes('kyc') || lowerMsg.includes('document')) {
          reply =
            'Your identity documents have been re-validated against the KRA database. Your KYC compliance status is now Verified with full segment access enabled.';
        }

        const agentMsg: TicketMessage = {
          id: `msg-${Date.now()}`,
          sender: 'support',
          senderName: 'Vertex Support',
          text: reply,
          time: timeStr,
          timestamp: formattedDate,
        };

        setTickets((prev) =>
          prev.map((t) => {
            if (t.id === ticketId) {
              return {
                ...t,
                status: 'IN_PROGRESS',
                updatedAt: formattedDate,
                messages: [...t.messages, agentMsg],
              };
            }
            return t;
          })
        );
      }, 2500);
    }, 1200);
  };

  // Toggle Ticket Status (Resolve / Reopen)
  const handleToggleStatus = async (targetStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => {
    if (!selectedTicketId) return;

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === selectedTicketId) {
          return {
            ...t,
            status: targetStatus,
            updatedAt: 'Just now',
          };
        }
        return t;
      })
    );

    showToast({
      type: 'info',
      title: 'Ticket Status Updated',
      description: `Ticket marked as ${targetStatus}.`,
    });

    try {
      await authApi.updateTicketStatus(selectedTicketId, targetStatus);
    } catch {
      // offline
    }
  };

  // Rate Ticket
  const handleRateTicket = async (stars: number) => {
    if (!selectedTicketId) return;

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === selectedTicketId) {
          return { ...t, rating: stars };
        }
        return t;
      })
    );

    showToast({
      type: 'success',
      title: 'Rating Submitted',
      description: `Thank you for rating our support ${stars} stars!`,
    });

    try {
      await authApi.rateTicket(selectedTicketId, stars);
    } catch {
      // offline
    }
  };

  // Helper Badge Color
  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'OPEN') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-400 text-xs font-bold font-mono">
          Open
        </span>
      );
    }
    if (s === 'IN_PROGRESS') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/40 text-sky-400 text-xs font-bold font-mono">
          In Progress
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 text-xs font-bold font-mono">
        Resolved
      </span>
    );
  };

  const getPriorityBadge = (priority?: string) => {
    const p = priority?.toUpperCase() || 'MEDIUM';
    if (p === 'URGENT') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/40 text-rose-400 text-xs font-bold font-mono">
          Urgent
        </span>
      );
    }
    if (p === 'HIGH') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-400 text-xs font-bold font-mono">
          High
        </span>
      );
    }
    if (p === 'LOW') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/40 text-slate-400 text-xs font-bold font-mono">
          Low
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
        Medium
      </span>
    );
  };

  // ==========================================
  // VIEW 1: SUPPORT TICKETS LIST (SCREENSHOT 1)
  // ==========================================
  if (currentView === 'LIST') {
    return (
      <div className="w-full max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 animate-fadeIn">
        {/* Header matching Screenshot 1 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-8 h-8 rounded-lg bg-[#0E1726] border border-[#1E2B40] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Support Tickets
            </h2>
          </div>

          <button
            type="button"
            id="new-ticket-btn"
            onClick={() => setCurrentView('CREATE')}
            className="py-2 px-3.5 sm:px-4 rounded-xl bg-[#F97316] hover:bg-[#EA580C] active:bg-[#C2410C] text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md shadow-orange-950/30 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-950 stroke-[3]" />
            <span>New Ticket</span>
          </button>
        </div>

        {/* Status Metrics Bar (4 Columns) matching Screenshot 1 */}
        <div className="grid grid-cols-4 bg-[#0B111C] border border-[#162234] rounded-2xl p-3 sm:p-4 text-center divide-x divide-[#162234]">
          <div>
            <div className="text-xl sm:text-2xl font-black text-white">{counts.total}</div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 tracking-wider mt-0.5 uppercase">
              TOTAL
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-[#F97316]">{counts.open}</div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 tracking-wider mt-0.5 uppercase">
              OPEN
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-sky-400">{counts.inProgress}</div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 tracking-wider mt-0.5 uppercase">
              IN PROGRESS
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">{counts.resolved}</div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 tracking-wider mt-0.5 uppercase">
              RESOLVED
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by ticket ID, subject, or message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#080E18] border border-[#182538] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#F97316] transition-colors font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Chips */}
          <div className="flex items-center gap-1 bg-[#080E18] p-1 rounded-xl border border-[#182538] overflow-x-auto">
            {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#182538] text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'ALL'
                  ? 'All'
                  : st === 'IN_PROGRESS'
                  ? 'In Progress'
                  : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Tickets Cards List matching Screenshot 1 */}
        <div className="space-y-3">
          {filteredTickets.length === 0 ? (
            <div className="bg-[#080E18] border border-[#162234] rounded-2xl p-8 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-300">No support tickets found</div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {searchQuery
                  ? 'No tickets match your search filters.'
                  : 'Have a query or order issue? Click "+ New Ticket" to reach our 24/7 desk.'}
              </p>
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const lastMsg = ticket.messages[ticket.messages.length - 1];
              return (
                <div
                  key={ticket.id}
                  onClick={() => {
                    setSelectedTicketId(ticket.id);
                    setCurrentView('DETAIL');
                  }}
                  className="bg-[#0A111E] hover:bg-[#0E1728] border border-[#182538] hover:border-[#223650] rounded-2xl p-4 sm:p-5 space-y-3 cursor-pointer transition-all shadow-lg hover:shadow-xl"
                >
                  {/* Top Row: Ticket ID & Badges */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      {ticket.id}
                    </span>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(ticket.status)}
                      {getPriorityBadge(ticket.priority)}
                    </div>
                  </div>

                  {/* Subject Title */}
                  <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
                    {ticket.subject}
                  </h3>

                  {/* Category & Timestamp Row */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-[#121C2B] border border-[#1C2C42] text-slate-300 font-semibold text-[11px]">
                      {ticket.category}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {ticket.updatedAt || ticket.createdAt}
                    </span>
                  </div>

                  {/* Message Preview Bubble matching Screenshot 1 */}
                  {lastMsg && (
                    <div className="bg-[#060B13] border border-[#141E2E] rounded-xl p-3 text-xs text-slate-300 leading-relaxed font-normal flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                      <p className="line-clamp-2">
                        <span className="font-bold text-slate-200">
                          {lastMsg.sender === 'support' ? 'Support:' : 'You:'}{' '}
                        </span>
                        {lastMsg.text}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: RAISE A TICKET FORM (SCREENSHOT 2)
  // ==========================================
  if (currentView === 'CREATE') {
    return (
      <div className="w-full max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCurrentView('LIST')}
            className="w-8 h-8 rounded-lg bg-[#0E1726] border border-[#1E2B40] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Raise a Ticket
          </h2>
        </div>

        <form onSubmit={handleSubmitTicket} className="space-y-4">
          {/* CATEGORY SELECTOR (6 Options Grid) matching Screenshot 2 */}
          <div>
            <label className="text-xs font-black tracking-wider text-slate-400 uppercase block mb-2">
              CATEGORY <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`py-3 px-3 rounded-xl border text-xs font-semibold text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#142032] border-[#F97316] text-white shadow-md shadow-orange-950/20'
                        : 'bg-[#080E18] border-[#182538] text-slate-400 hover:text-slate-200 hover:bg-[#0D1524]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PRIORITY SELECTOR matching Screenshot 2 */}
          <div>
            <label className="text-xs font-black tracking-wider text-slate-400 uppercase block mb-2">
              PRIORITY
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map((p) => {
                const isSelected = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1A202C] border-[#F97316] text-[#F97316] shadow-sm'
                        : 'bg-[#080E18] border-[#182538] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SUBJECT INPUT with 0/120 counter */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-black tracking-wider text-slate-400 uppercase">
                SUBJECT <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] font-mono text-slate-500">{subject.length}/120</span>
            </div>
            <input
              type="text"
              maxLength={120}
              required
              placeholder="Brief description of your issue"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-[#080E18] border border-[#182538] rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#F97316] transition-colors"
            />
          </div>

          {/* DESCRIPTION TEXTAREA with character counter */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-black tracking-wider text-slate-400 uppercase">
                DESCRIPTION <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] font-mono text-slate-500">
                {description.length} chars
              </span>
            </div>
            <textarea
              rows={4}
              required
              placeholder="Describe your issue in detail — include order IDs, amounts, timestamps, or any error messages you saw..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#080E18] border border-[#182538] rounded-xl p-3.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#F97316] transition-colors resize-none"
            />
          </div>

          {/* ATTACH SCREENSHOT (Drag & Drop or Click) matching Screenshot 2 */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
              onChange={(e) => handleFileUpload(e, false)}
            />

            {!attachedImage ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-[#080E18] border border-dashed border-[#203048] hover:border-[#F97316] rounded-xl p-4 flex items-center justify-center gap-2 text-center cursor-pointer transition-colors"
              >
                <Paperclip className="w-4 h-4 text-slate-400" />
                <div className="text-xs text-slate-400 font-semibold">
                  <span className="text-slate-300">Attach Screenshot</span>{' '}
                  <span className="text-slate-500">PNG, JPG up to 5 MB (optional)</span>
                </div>
              </div>
            ) : (
              <div className="w-full bg-[#0D1524] border border-[#1E2E44] rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={attachedImage}
                    alt="attachment preview"
                    className="w-10 h-10 object-cover rounded-lg border border-slate-700"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {attachedImageName || 'Screenshot attached'}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-semibold">Ready to upload</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAttachedImage(null);
                    setAttachedImageName(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* SLA RESPONSE TIME INFO BOX matching Screenshot 2 */}
          <div className="bg-[#080E18] border border-[#162234] rounded-xl p-3 text-xs text-slate-400 leading-relaxed flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
            <div>
              Response time:{' '}
              <span className="text-rose-400 font-bold">Urgent</span> within 2 hrs •{' '}
              <span className="text-amber-400 font-bold">High</span> within 6 hrs •{' '}
              <span className="text-slate-300 font-semibold">Medium/Low</span> within 24 hrs.
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={submittingTicket || !subject.trim() || !description.trim()}
            className="w-full py-3.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] active:bg-[#C2410C] disabled:bg-[#1E2A3C] disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-black text-sm tracking-wide transition-all shadow-lg shadow-orange-950/30 cursor-pointer"
          >
            {submittingTicket ? 'Submitting Ticket...' : 'Submit Ticket'}
          </button>
        </form>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: TICKET DETAIL & CHAT (SCREENSHOTS 3, 4, 5)
  // ==========================================
  return (
    <div className="w-full max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 animate-fadeIn flex flex-col min-h-[85vh]">
      {/* Top Bar matching Screenshots */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCurrentView('LIST')}
            className="w-8 h-8 rounded-lg bg-[#0E1726] border border-[#1E2B40] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg sm:text-xl font-black text-white font-mono">
            {activeTicket?.id || 'Ticket Details'}
          </h2>
        </div>

        {/* Quick Resolution Toggle */}
        {activeTicket && (
          <div className="flex items-center gap-2">
            {activeTicket.status === 'RESOLVED' ? (
              <button
                type="button"
                onClick={() => handleToggleStatus('IN_PROGRESS')}
                className="px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-bold transition-all cursor-pointer"
              >
                Reopen Ticket
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleToggleStatus('RESOLVED')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all cursor-pointer"
              >
                Mark Resolved
              </button>
            )}
          </div>
        )}
      </div>

      {activeTicket && (
        <>
          {/* Ticket Header Banner matching Screenshots 3, 4, 5 */}
          <div className="bg-[#0B111C] border border-[#182538] rounded-2xl p-4 sm:p-5 space-y-3 shadow-lg">
            <h3 className="text-base sm:text-lg font-black text-white leading-tight">
              {activeTicket.subject}
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              {getStatusBadge(activeTicket.status)}
              {getPriorityBadge(activeTicket.priority)}
              <span className="px-2.5 py-0.5 rounded-lg bg-[#121C2B] border border-[#1C2C42] text-slate-300 font-semibold text-xs">
                {activeTicket.category}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-[#141F30]">
              <span>Created: {activeTicket.createdAt}</span>
              <span>Updated: {activeTicket.updatedAt || activeTicket.createdAt}</span>
            </div>
          </div>

          {/* CSAT Star Rating Widget if Ticket is Resolved */}
          {activeTicket.status === 'RESOLVED' && (
            <div className="bg-[#080E18] border border-emerald-500/30 rounded-xl p-3.5 text-center space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Rate your Support Experience
              </div>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRateTicket(star)}
                    className="p-1 transition-transform hover:scale-125 cursor-pointer"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        (activeTicket.rating || 0) >= star
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversation Divider matching Screenshot 3 */}
          <div className="relative flex items-center justify-center my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#162234]" />
            </div>
            <span className="relative bg-[#060B13] px-3 text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest">
              CONVERSATION
            </span>
          </div>

          {/* Message Thread */}
          <div className="flex-1 space-y-4 overflow-y-auto max-h-[50vh] pr-1 custom-scrollbar">
            {activeTicket.messages.map((msg, idx) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id || idx}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {/* Sender Name & Timestamp Header matching Screenshots */}
                  <div
                    className={`flex items-center gap-1.5 mb-1.5 text-xs text-slate-400 font-mono ${
                      isUser ? 'flex-row' : 'flex-row'
                    }`}
                  >
                    {!isUser && (
                      <span className="w-4 h-4 rounded bg-[#F97316] text-slate-950 font-black text-[10px] flex items-center justify-center">
                        V
                      </span>
                    )}
                    <span className="font-semibold text-slate-300">
                      {isUser ? 'You' : 'Vertex Support'}
                    </span>
                    <span>•</span>
                    <span className="text-slate-500">{msg.time}</span>
                    {isUser && (
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 font-bold text-[10px] flex items-center justify-center ml-0.5">
                        U
                      </span>
                    )}
                  </div>

                  {/* Message Bubble matching Screenshot 3 & 4 */}
                  <div
                    className={`max-w-[88%] sm:max-w-[80%] rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#151D2A] border border-[#7C481A] text-slate-100 shadow-md'
                        : 'bg-[#0D1624] border border-[#1C2C40] text-slate-200 shadow-md'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>

                    {/* Attached Image inside Bubble */}
                    {msg.attachmentUrl && (
                      <div className="mt-2.5 rounded-lg overflow-hidden border border-slate-700">
                        <img
                          src={msg.attachmentUrl}
                          alt="Screenshot attached"
                          className="w-full max-h-48 object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Support Agent Typing Indicator Simulation */}
            {isTypingSupport && (
              <div className="flex flex-col items-start animate-fadeIn">
                <div className="flex items-center gap-1.5 mb-1.5 text-xs text-slate-400 font-mono">
                  <span className="w-4 h-4 rounded bg-[#F97316] text-slate-950 font-black text-[10px] flex items-center justify-center">
                    V
                  </span>
                  <span className="font-semibold text-slate-300">Vertex Support</span>
                </div>
                <div className="bg-[#0D1624] border border-[#1C2C40] rounded-2xl px-4 py-3 text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#F97316] animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-[#F97316] animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 rounded-full bg-[#F97316] animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] font-mono ml-2">Agent is typing response...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Reply Bar matching Screenshots 3, 4, 5 */}
          <div className="pt-2 sticky bottom-0 bg-[#060B13]">
            <input
              type="file"
              ref={replyFileInputRef}
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
              onChange={(e) => handleFileUpload(e, true)}
            />

            {/* Attachment Preview above reply input */}
            {replyAttachment && (
              <div className="mb-2 bg-[#0D1624] border border-[#1E2E44] rounded-xl p-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={replyAttachment}
                    alt="attachment"
                    className="w-8 h-8 rounded object-cover border border-slate-700"
                  />
                  <span className="text-xs text-slate-300 font-semibold">Image Attached</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyAttachment(null)}
                  className="p-1 text-slate-400 hover:text-rose-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="bg-[#080E18] border border-[#182538] rounded-2xl p-2 flex items-center gap-2 shadow-xl focus-within:border-[#F97316] transition-colors">
              <button
                type="button"
                onClick={() => replyFileInputRef.current?.click()}
                title="Attach Screenshot"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#142032] transition-colors cursor-pointer"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                type="text"
                placeholder="Type your reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendReply();
                  }
                }}
                className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none px-1"
              />

              <button
                type="button"
                disabled={sendingReply || (!replyText.trim() && !replyAttachment)}
                onClick={handleSendReply}
                className="w-9 h-9 rounded-xl bg-[#142032] hover:bg-[#F97316] active:bg-[#EA580C] text-slate-400 hover:text-slate-950 disabled:opacity-40 disabled:hover:bg-[#142032] disabled:hover:text-slate-400 flex items-center justify-center transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
