import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import {
    Users, Calendar, Coins, Wallet, CreditCard, Unlock, Lock, Info,
    Loader2, User, ShieldCheck,
    MessageSquare, Clock, XCircle,
    UserPlus, Share2, Check, Hammer, PlusCircle, RefreshCw, Grid, HelpCircle,
    LayoutDashboard, ArrowLeft, Trophy, Sliders, List
} from 'lucide-react';
import { Loader } from '../../components/ui/Loader';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { KYCChitGuard } from '../../components/ui/KYCChitGuard';
import { useChitSidebar } from '../../context/ChitSidebarContext';
import { getCurrencySymbol, formatCurrency } from '../../utils/currency';

// Cycles Module Components & Hooks
import { useChitCycles } from '../../hooks/useChitCycles';
import { CycleStatistics } from '../../components/cycles/CycleStatistics';
import { CycleCard } from '../../components/cycles/CycleCard';
import { CycleTable } from '../../components/cycles/CycleTable';
import { CycleTimeline } from '../../components/cycles/CycleTimeline';
import { CycleStatusBadge } from '../../components/cycles/CycleStatusBadge';
import { PaymentCollectionBadge } from '../../components/cycles/PaymentCollectionBadge';
import { PaymentStatusBadge } from '../../components/installments/PaymentStatusBadge';
import { ConfirmationDialog } from '../../components/cycles/ConfirmationDialog';
import { CreateCycleModal } from '../../components/cycles/CreateCycleModal';
import { RecordWinnerModal, type RecordWinnerFormData } from '../../components/cycles/RecordWinnerModal';

// Auctions Module Components & Hooks
import { useAuctions } from '../../hooks/useAuctions';
import { AuctionCard } from '../../components/auctions/AuctionCard';
import { AuctionTable } from '../../components/auctions/AuctionTable';
import { AuctionStatusBadge } from '../../components/auctions/AuctionStatusBadge';
import { CountdownTimer } from '../../components/auctions/CountdownTimer';
import { WinnerBanner } from '../../components/auctions/WinnerBanner';
import { AuctionTimeline } from '../../components/auctions/AuctionTimeline';
import { ScheduleAuctionModal, type ScheduleAuctionFormData } from '../../components/auctions/ScheduleAuctionModal';
import { EmbeddedBiddingRoom } from '../../components/auctions/EmbeddedBiddingRoom';
import type { AuctionStatus, DeclareAuctionWinnerInput } from '../../types/auction';

// Installments Module Components & Hooks
import { useInstallments } from '../../hooks/useInstallments';
import { StatisticsCards } from '../../components/installments/StatisticsCards';
import { CollectionProgress } from '../../components/installments/CollectionProgress';
import { InstallmentTable } from '../../components/installments/InstallmentTable';
import { PayNowModal } from '../../components/installments/PayNowModal';
import { NeedHelpTab } from '../../components/help/NeedHelpTab';

interface Member {
    _id: string;
    userId: {
        _id: string;
        name: string;
        email: string;
    };
    role: string;
    joinedAt: string;
    status: string;
}

interface Group {
    _id: string;
    name: string;
    totalMembers: number;
    currentMemberCount: number;
    monthlyContribution: number;
    startDate: string;
    auctionType: string;
    status: string;
    commissionPercent: number;
    organizerId: {
        _id: string;
        name: string;
        email: string;
    };
    description?: string;
}

export const ChitDetails = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();

    const {
        activeTab,
        setActiveTab,
        setGroup: setSidebarGroup,
        setPendingCount,
        setIsOrganizer: setSidebarIsOrganizer,
        reset,
    } = useChitSidebar();

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam) {
            const uppercaseTab = tabParam.toUpperCase() as any;
            if (['OVERVIEW', 'MEMBERS', 'CYCLES', 'AUCTIONS', 'INSTALLMENTS', 'HELP'].includes(uppercaseTab)) {
                setActiveTab(uppercaseTab);
            }
        }
    }, [searchParams, setActiveTab]);

    const [group, setGroup] = useState<Group | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);

    // Members Tab state
    const [viewMode, setViewMode] = useState<'LIST' | 'REQUESTS'>('LIST');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [isManualAddModalOpen, setIsManualAddModalOpen] = useState(false);
    const [searchEmail, setSearchEmail] = useState('');
    const [searchResult, setSearchResult] = useState<any>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Cycles Tab state
    const [selectedCycleDetailId, setSelectedCycleDetailId] = useState<string | null>(null);
    const [cycleFilterTab, setCycleFilterTab] = useState<'ALL' | 'ACTIVE' | 'UPCOMING' | 'COMPLETED'>('ALL');
    const [cycleViewMode, setCycleViewMode] = useState<'LIST' | 'TIMELINE'>('LIST');
    const [cycleConfirmModal, setCycleConfirmModal] = useState<{
        isOpen: boolean;
        type: 'start' | 'complete' | 'cancel' | 'openCollections' | 'closeCollections' | null;
        cycleId: string | null;
        cycleNumber?: number;
    }>({ isOpen: false, type: null, cycleId: null });
    const [isCreateCycleModalOpen, setIsCreateCycleModalOpen] = useState(false);
    const [cycleWinnerModal, setCycleWinnerModal] = useState<{ isOpen: boolean; cycleId: string | null; cycleNumber: number }>({
        isOpen: false,
        cycleId: null,
        cycleNumber: 0
    });

    // Installment Payment Modal state
    const [selectedPaymentInstallment, setSelectedPaymentInstallment] = useState<any>(null);

    // Auctions Tab state
    const [selectedAuctionDetailId, setSelectedAuctionDetailId] = useState<string | null>(null);
    const [selectedBiddingRoomId, setSelectedBiddingRoomId] = useState<string | null>(null);
    const [auctionViewOrigin, setAuctionViewOrigin] = useState<'LIST' | 'DETAILS'>('LIST');

    useEffect(() => {
        setSelectedCycleDetailId(null);
        setSelectedAuctionDetailId(null);
        setSelectedBiddingRoomId(null);
        setAuctionViewOrigin('LIST');
    }, [activeTab]);
    const [auctionFilterTab, setAuctionFilterTab] = useState<'ALL' | AuctionStatus>('ALL');
    const [isScheduleAuctionModalOpen, setIsScheduleAuctionModalOpen] = useState(false);
    const [auctionWinnerModal, setAuctionWinnerModal] = useState<{ isOpen: boolean; auctionId: string | null; auctionNumber: number }>({
        isOpen: false,
        auctionId: null,
        auctionNumber: 0
    });
    const [auctionConfirmModal, setAuctionConfirmModal] = useState<{
        isOpen: boolean;
        type: 'start' | 'close' | 'cancel' | null;
        auctionId: string | null;
        auctionNumber?: number;
    }>({ isOpen: false, type: null, auctionId: null });

    // Installments Tab state
    const [selectedCycleId, setSelectedCycleId] = useState<string>('');
    const [confirmWaive, setConfirmWaive] = useState<{ isOpen: boolean; installmentId: string | null }>({
        isOpen: false,
        installmentId: null
    });

    // Robust Organizer and Admin Role Detection
    const organizerIdStr = group ? (typeof group.organizerId === 'object' ? (group.organizerId?._id || (group.organizerId as any)?.id) : group.organizerId) : null;
    const currentUserIdStr = user?.id || (user as any)?._id;
    const isOrganizer = !!group && (
        (!!organizerIdStr && !!currentUserIdStr && organizerIdStr === currentUserIdStr) ||
        user?.role === 'ORGANIZER' ||
        user?.role === 'ADMIN'
    );
    const isAdmin = user?.role === 'ADMIN';

    // Current User Chit-Specific Membership Detection (Independent of Global Role)
    const myMembership = members.find(m => {
        const memUserId = typeof m.userId === 'object' ? (m.userId?._id || (m.userId as any)?.id) : m.userId;
        return memUserId === currentUserIdStr;
    });
    const isMyMembershipActive = Boolean(myMembership && ['APPROVED', 'ACTIVE_MEMBER'].includes(myMembership.status));
    const isMyMembershipRequested = Boolean(myMembership && myMembership.status === 'REQUESTED');

    // Feature module hooks
    const {
        cycles,
        loading: cyclesLoading,
        actionLoading: cycleActionLoading,
        refetch: refetchCycles,
        createCycle,
        startCycle,
        completeCycle,
        cancelCycle,
        recordWinner: recordCycleWinner,
        openCollections,
        closeCollections
    } = useChitCycles(id);

    const {
        auctions,
        liveAuction,
        loading: auctionsLoading,
        actionLoading: auctionActionLoading,
        createAuction,
        updateStatus: updateAuctionStatus,
        declareWinner: declareAuctionWinner
    } = useAuctions(id);

    const {
        installments,
        stats,
        loading: installmentsLoading,
        actionLoading: installmentActionLoading,
        generateCycleInstallments,
        waiveLateFee,
        refetch: refetchInstallments
    } = useInstallments(id, selectedCycleId);

    const fetchDetails = async () => {
        try {
            const res = await api.get(`/chit-groups/details/${id}`);
            const grp: Group = res.data.data.group;
            const mems: Member[] = res.data.data.members;
            setGroup(grp);
            setMembers(mems);
            setSidebarGroup(grp);
            setSidebarIsOrganizer(user?.id === grp.organizerId._id);
            const pending = mems.filter(m => m.status === 'REQUESTED').length;
            setPendingCount(pending);
        } catch (err) {
            console.error('Failed to fetch details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.kycStatus === 'APPROVED') {
            fetchDetails();
        } else {
            setLoading(false);
        }
        return () => reset();
    }, [id, user?.kycStatus]);

    // Auto-select active or latest cycle when cycles load
    useEffect(() => {
        if (cycles.length > 0) {
            const activeCycle = cycles.find(c => c.status === 'ACTIVE');
            const defaultCycle = activeCycle || cycles[cycles.length - 1] || cycles[0];
            if (!selectedCycleId || !cycles.some(c => c._id === selectedCycleId)) {
                setSelectedCycleId(defaultCycle._id);
            }
        }
    }, [cycles, selectedCycleId]);

    if (user?.kycStatus !== 'APPROVED') {
        return <KYCChitGuard title="Chit Circle Access Restricted" />;
    }

    const handleCopyShareLink = () => {
        if (!group) return;
        const link = `${window.location.origin}/join/${group._id}`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleApproval = async (membershipId: string, approve: boolean) => {
        setActionLoading(membershipId);
        try {
            const endpoint = approve ? 'approve' : 'reject';
            await api.post(`/chit-groups/members/${endpoint}/${membershipId}`);
            fetchDetails();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Action failed');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSearchUser = async () => {
        if (!searchEmail) return;
        setIsSearching(true);
        setSearchError(null);
        setSearchResult(null);
        try {
            const res = await api.get(`/user/search?email=${encodeURIComponent(searchEmail.trim())}`);
            if (res.data.data?.user) {
                setSearchResult(res.data.data.user);
            } else {
                setSearchError(res.data.data?.message || 'No KYC-approved user found with this email.');
            }
        } catch (err: any) {
            setSearchError(err.response?.data?.message || 'User not found or not KYC approved');
        } finally {
            setIsSearching(false);
        }
    };

    const handleManualAdd = async () => {
        if (!searchResult) return;
        setIsAdding(true);
        try {
            await api.post(`/chit-groups/${id}/add-member`, { email: searchResult.email });
            setIsManualAddModalOpen(false);
            setSearchEmail('');
            setSearchResult(null);
            fetchDetails();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to add member');
        } finally {
            setIsAdding(false);
        }
    };

    // Cycle action handlers
    const handleConfirmCycleAction = async () => {
        if (!cycleConfirmModal.cycleId || !cycleConfirmModal.type) return;
        try {
            if (cycleConfirmModal.type === 'start') {
                await startCycle(cycleConfirmModal.cycleId);
            } else if (cycleConfirmModal.type === 'complete') {
                await completeCycle(cycleConfirmModal.cycleId);
            } else if (cycleConfirmModal.type === 'cancel') {
                await cancelCycle(cycleConfirmModal.cycleId);
            } else if (cycleConfirmModal.type === 'openCollections') {
                await openCollections(cycleConfirmModal.cycleId);
            } else if (cycleConfirmModal.type === 'closeCollections') {
                await closeCollections(cycleConfirmModal.cycleId);
            }
            setCycleConfirmModal({ isOpen: false, type: null, cycleId: null });
        } catch (err) {
            console.error('Cycle action failed', err);
        }
    };

    // Auction action handlers
    const handleConfirmAuctionAction = async () => {
        if (!auctionConfirmModal.auctionId || !auctionConfirmModal.type) return;
        try {
            if (auctionConfirmModal.type === 'start') {
                await updateAuctionStatus(auctionConfirmModal.auctionId, 'OPEN');
            } else if (auctionConfirmModal.type === 'close') {
                await updateAuctionStatus(auctionConfirmModal.auctionId, 'CLOSED');
            } else if (auctionConfirmModal.type === 'cancel') {
                await updateAuctionStatus(auctionConfirmModal.auctionId, 'CANCELLED');
            }
            setAuctionConfirmModal({ isOpen: false, type: null, auctionId: null });
        } catch (err) {
            console.error('Auction action failed', err);
        }
    };

    // Installment waive handler
    const handleConfirmWaive = async () => {
        if (!confirmWaive.installmentId) return;
        try {
            await waiveLateFee(confirmWaive.installmentId);
            setConfirmWaive({ isOpen: false, installmentId: null });
        } catch (err) {
            console.error('Waive fee failed', err);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center p-20"><Loader size="lg" /></div>;
    if (!group) return <div className="p-8 text-center bg-transparent text-slate-500 font-bold">Group not found</div>;

    const pendingMembers = members.filter(m => m.status === 'REQUESTED');
    const approvedMembers = members.filter(m => ['APPROVED', 'ACTIVE_MEMBER'].includes(m.status));
    const totalPoolAmount = group.monthlyContribution * group.totalMembers;

    // Filtered cycles & auctions
    const filteredCycles = cycles.filter(c => cycleFilterTab === 'ALL' || c.status === cycleFilterTab);
    const filteredAuctions = auctions.filter(a => auctionFilterTab === 'ALL' || a.status === auctionFilterTab);
    const nextCycleNumber = cycles.length + 1;

    const memberOptions = members.map(m => ({
        membershipId: m._id,
        userName: m.userId.name,
        userEmail: m.userId.email
    }));

    const cycleOptionsForAuctions = cycles.map(c => ({
        cycleId: c._id,
        cycleNumber: c.cycleNumber,
        status: c.status
    }));

    return (
        <div className="w-full pb-12 animate-in fade-in duration-500 space-y-6">

            {/* ─── 1. OVERVIEW TAB ─── */}
            {activeTab === 'OVERVIEW' && (
                <div className="bg-transparent p-0 border-none shadow-none space-y-6">
                    {/* Top Standard Title Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                                <LayoutDashboard className="w-4 h-4" />
                                <span>Circle Overview</span>
                            </div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Circle Summary & Details</h2>
                        </div>
                    </div>

                    {/* Membership Status Banner (For REQUESTED or ACTIVE_MEMBER) */}
                    {isMyMembershipRequested && (
                        <div className="bg-amber-50 border border-amber-200/80 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shrink-0 shadow-xs">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">Membership Pending Approval</h4>
                                        <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black rounded-md">REQUESTED</span>
                                    </div>
                                    <p className="text-xs text-amber-800 font-medium mt-0.5">
                                        {isOrganizer
                                            ? 'You have requested subscriber membership in your own chit. As the organizer, you can approve your request in the Members tab or directly approve yourself below.'
                                            : 'Your request to join this circle has been submitted and is pending organizer review.'}
                                    </p>
                                </div>
                            </div>
                            {isOrganizer && (
                                <button
                                    onClick={() => handleApproval(myMembership!._id, true)}
                                    disabled={!!actionLoading}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shrink-0 shadow-xs flex items-center gap-1.5 active:scale-95"
                                >
                                    {actionLoading === myMembership!._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    <span>Approve My Membership</span>
                                </button>
                            )}
                        </div>
                    )}

                    {isMyMembershipActive && (
                        <div className="bg-emerald-50/80 border border-emerald-200/80 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shrink-0 shadow-xs">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wider">Enrolled Active Subscriber</h4>
                                        <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 text-[10px] font-black rounded-md">ACTIVE_MEMBER</span>
                                        {isOrganizer && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-black rounded-md">ORGANIZER + MEMBER</span>}
                                    </div>
                                    <p className="text-xs text-emerald-800 font-medium mt-0.5">
                                        You are actively subscribed to this circle. You participate in cycles, monthly bidding, and installment contributions.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setActiveTab('INSTALLMENTS')}
                                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                >
                                    <Coins className="w-3.5 h-3.5" />
                                    <span>My Dues</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('AUCTIONS')}
                                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                >
                                    <Hammer className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Bidding Room</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Organizer Lead Header Card — transparent icon logo, no lead green tag, no border/shadow */}
                    <div className="bg-white p-6 rounded-2xl border-none shadow-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-black shrink-0 shadow-xs">
                                <User className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Lead Organizer: {group.organizerId.name}</h3>
                                <p className="text-xs text-slate-400">{group.organizerId.email}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border-none shadow-none">
                                System: {group.auctionType === 'AUCTION' ? 'Competitive Auction' : 'Lottery Draw'}
                            </span>
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border-none shadow-none">
                                Commission: {group.commissionPercent}%
                            </span>
                            {isOrganizer && (
                                <button
                                    onClick={handleCopyShareLink}
                                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer ${
                                        copied
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-900 hover:bg-emerald-600 text-white'
                                    }`}
                                >
                                    {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5 text-emerald-400" />}
                                    <span>{copied ? 'Link Copied' : 'Share Circle Link'}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Active Cycle & Live Auction Quick Card */}
                    {(() => {
                        const currentCycle = cycles.find(c => c.status === 'ACTIVE') || (cycles.length > 0 ? cycles[cycles.length - 1] : null);
                        const currentAuction = liveAuction || (currentCycle ? auctions.find(a => {
                            const cId = typeof a.cycleId === 'object' ? (a.cycleId as any)._id : a.cycleId;
                            return cId === currentCycle._id;
                        }) : null);

                        if (!currentCycle) return null;

                        return (
                            <div className="bg-slate-900 text-white p-6 rounded-2xl border-none shadow-none flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            Cycle #{currentCycle.cycleNumber} ({currentCycle.status})
                                        </span>
                                        {currentAuction && (
                                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                                currentAuction.status === 'OPEN' ? 'bg-emerald-500 text-white animate-pulse' : 'bg-slate-800 text-slate-300'
                                            }`}>
                                                Auction #{currentAuction.auctionNumber}: {currentAuction.status}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-lg font-black text-white tracking-tight">
                                        {currentAuction?.status === 'OPEN' 
                                            ? '⚡ Live Auction In Progress — Place Your Bid Now'
                                            : currentCycle.status === 'ACTIVE'
                                                ? `Cycle #${currentCycle.cycleNumber} is Currently Active`
                                                : `Cycle #${currentCycle.cycleNumber} Scheduled`}
                                    </h3>
                                    <p className="text-xs text-slate-400 font-medium">
                                        {currentAuction?.status === 'OPEN'
                                            ? `Bidding is open between ${currentAuction.minimumBidPercentage}% and ${currentAuction.maximumBidPercentage}%. All active members can submit competitive bids.`
                                            : currentCycle.paymentCollection?.status === 'OPEN'
                                                ? `Installment collections are OPEN for this cycle. Make your payment before the due date.`
                                                : `Scheduled Start: ${format(new Date(currentCycle.scheduledStartDate), 'PPP')}`}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 shrink-0">
                                    {currentAuction?.status === 'OPEN' ? (
                                        <button
                                            onClick={() => {
                                                setActiveTab('AUCTIONS');
                                                setAuctionViewOrigin('LIST');
                                                setSelectedBiddingRoomId(currentAuction._id);
                                            }}
                                            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                                        >
                                            <Hammer className="w-4 h-4" />
                                            <span>Enter Bidding Room</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setActiveTab('AUCTIONS')}
                                            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
                                        >
                                            <Hammer className="w-3.5 h-3.5 text-emerald-400" />
                                            <span>View Auctions</span>
                                        </button>
                                    )}

                                    <button
                                        onClick={() => {
                                            setActiveTab('INSTALLMENTS');
                                            setSelectedCycleId(currentCycle._id);
                                        }}
                                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
                                    >
                                        <Wallet className="w-3.5 h-3.5 text-sky-400" />
                                        <span>Installments & Dues</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* 4 Financial Stat Cards — no borders, no shadows */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-2xl border-none shadow-none flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Pot Value</span>
                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                                    <Coins className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-slate-900 tracking-tight mt-2">{formatCurrency(totalPoolAmount, (group as any).financialConfig?.currency)}</div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border-none shadow-none flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Monthly Dues</span>
                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-sky-400 flex items-center justify-center font-bold shrink-0">
                                    <Wallet className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-slate-900 tracking-tight mt-2">{formatCurrency(group.monthlyContribution, (group as any).financialConfig?.currency)}</div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border-none shadow-none flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Seats / Duration</span>
                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                                    <Users className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-slate-900 tracking-tight mt-2">{group.totalMembers} Members</div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border-none shadow-none flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Start Date</span>
                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold shrink-0">
                                    <Calendar className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="text-xl font-black text-slate-900 tracking-tight mt-2">{format(new Date(group.startDate), 'PP')}</div>
                        </div>
                    </div>

                    {group.description && (
                        <div className="p-5 bg-white border-none shadow-none rounded-2xl">
                            <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest block mb-1">Note from Organizer</span>
                            <p className="text-xs text-slate-700 font-bold leading-relaxed">{group.description}</p>
                        </div>
                    )}

                    {/* Dedicated Financial Configuration Card */}
                    <div className="bg-white p-6 rounded-2xl border-none shadow-none space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                                    <Sliders className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 tracking-tight">Financial Configuration</h3>
                                    <p className="text-xs text-slate-400 font-medium">Scheme rules, fees, & operational policies</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl">
                                Version {(group as any).financialConfig?.version || 1}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                            <div className="bg-slate-50 p-4 rounded-xl">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Commission</span>
                                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                                    {(group as any).financialConfig?.commission?.type === 'FIXED' 
                                        ? formatCurrency((group as any).financialConfig?.commission?.value || 0, (group as any).financialConfig?.currency)
                                        : `${(group as any).financialConfig?.commission?.value ?? group.commissionPercent ?? 2}%`} 
                                    ({(group as any).financialConfig?.commission?.type || 'PERCENTAGE'})
                                </span>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Late Fee</span>
                                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                                    {(group as any).financialConfig?.lateFee?.value 
                                        ? ((group as any).financialConfig?.lateFee?.type === 'PERCENTAGE' 
                                            ? `${(group as any).financialConfig.lateFee.value}%` 
                                            : formatCurrency((group as any).financialConfig.lateFee.value, (group as any).financialConfig?.currency))
                                        : 'No Fee'} 
                                    ({(group as any).financialConfig?.lateFee?.type || 'FIXED'})
                                </span>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Grace Period</span>
                                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                                    {(group as any).financialConfig?.gracePeriodDays ?? 3} Days
                                </span>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Auction Strategy</span>
                                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                                    {(group as any).financialConfig?.auctionStrategy || 'LOWEST_BID'}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 text-xs font-bold">
                            <span className={`px-3 py-1.5 rounded-xl ${(group as any).financialConfig?.allowPartialInstallment ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                Partial Installments: {(group as any).financialConfig?.allowPartialInstallment ? 'Allowed' : 'Disabled'}
                            </span>
                            <span className={`px-3 py-1.5 rounded-xl ${(group as any).financialConfig?.allowPrepayment !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                Prepayment: {(group as any).financialConfig?.allowPrepayment !== false ? 'Allowed' : 'Disabled'}
                            </span>
                            <span className={`px-3 py-1.5 rounded-xl ${(group as any).financialConfig?.allowPenaltyWaiver !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                Penalty Waiver: {(group as any).financialConfig?.allowPenaltyWaiver !== false ? 'Allowed' : 'Disabled'}
                            </span>
                            <span className="px-3 py-1.5 rounded-xl bg-slate-900 text-white">
                                Currency: {(group as any).financialConfig?.currency || 'INR'}
                            </span>
                        </div>
                    </div>

                    {/* Enrolled Members Roster Preview */}
                    <div className="bg-white p-6 rounded-2xl border-none shadow-none space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                                        Enrolled Members Roster ({approvedMembers.length} / {group.totalMembers})
                                    </h3>
                                    <p className="text-xs text-slate-400 font-medium">Circle participant roster & seat allocation</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveTab('MEMBERS')}
                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1"
                            >
                                <span>Manage Members</span>
                                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                            </button>
                        </div>

                        {approvedMembers.length === 0 ? (
                            <div className="py-6 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-xl">
                                No members approved yet. Manage pending enrollment requests in the Members tab.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                                {approvedMembers.slice(0, 6).map((m, idx) => {
                                    const isGroupOrg = (group.organizerId as any)?._id === m.userId._id || (group.organizerId as any) === m.userId._id;
                                    const isSelf = m.userId._id === currentUserIdStr;

                                    return (
                                        <div
                                            key={m._id}
                                            className={`p-3 rounded-xl border flex items-center gap-3 transition ${
                                                isSelf ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50/80 border-slate-100'
                                            }`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                                                isSelf ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-emerald-400'
                                            }`}>
                                                {m.userId.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-bold text-slate-900 truncate">{m.userId.name}</span>
                                                    {isSelf && <span className="text-[9px] font-black text-emerald-600 shrink-0">(You)</span>}
                                                    {isGroupOrg && <span className="text-[8px] font-bold px-1 bg-blue-50 text-blue-700 rounded shrink-0">Org</span>}
                                                </div>
                                                <span className="text-[10px] text-slate-400 block truncate">{m.userId.email}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Group Status Div — transparent, no borders */}
                    <div className="p-5 rounded-2xl flex items-center gap-4 bg-transparent border-none shadow-none">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            group.status === 'FORMING' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
                        }`}>
                            {group.status === 'FORMING' ? <Clock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">Group Status: {group.status}</h4>
                            <p className="text-xs text-slate-600 font-medium mt-0.5">
                                {group.status === 'FORMING'
                                    ? 'Member invitations and approvals are currently open. Financial cycles begin once all seats fill.'
                                    : 'Group formation complete. Financial cycles, auctions, and installment collections are active.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 2. MEMBERS TAB ─── */}
            {activeTab === 'MEMBERS' && (
                <div className="bg-transparent p-0 border-none shadow-none space-y-6">
                    {/* Notice for Pending Self-Approval */}
                    {isMyMembershipRequested && (
                        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-bold shadow-xs">
                            <div className="flex items-center gap-2.5">
                                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Your personal membership status in this circle is <strong>REQUESTED</strong> (Pending approval).</span>
                            </div>
                            {isOrganizer && (
                                <button
                                    onClick={() => handleApproval(myMembership!._id, true)}
                                    disabled={!!actionLoading}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0 shadow-xs flex items-center gap-1.5"
                                >
                                    {actionLoading === myMembership!._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    <span>Approve Your Request</span>
                                </button>
                            )}
                        </div>
                    )}
                    {/* Top Standard Title Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                                <Users className="w-4 h-4" />
                                <span>Member Management</span>
                            </div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Members & Quota Status</h2>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border-none shadow-none flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                                <svg className="w-16 h-16 transform -rotate-90">
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-emerald-500" strokeDasharray={176} strokeDashoffset={176 - (176 * (approvedMembers.length / group.totalMembers))} strokeLinecap="round" />
                                </svg>
                                <span className="absolute text-xs font-black text-slate-900">{Math.round((approvedMembers.length / group.totalMembers) * 100)}%</span>
                            </div>

                            <div>
                                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Quota Completion</h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    {approvedMembers.length} of {group.totalMembers} spots secured in this circle
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                            <button
                                onClick={() => setViewMode('LIST')}
                                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer ${
                                    viewMode === 'LIST'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-900 hover:bg-emerald-600 text-white'
                                }`}
                            >
                                <Users className="w-4 h-4 text-emerald-400" />
                                <span>Enrolled Members ({approvedMembers.length})</span>
                            </button>

                             {isOrganizer && (
                                <button
                                    onClick={() => setViewMode('REQUESTS')}
                                    className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer ${
                                        viewMode === 'REQUESTS'
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-900 hover:bg-emerald-600 text-white'
                                    }`}
                                >
                                    <User className="w-4 h-4 text-emerald-400" />
                                    <span>Manage Requests ({pendingMembers.length})</span>
                                </button>
                            )}

                            {isOrganizer && (
                                <button
                                    onClick={handleCopyShareLink}
                                    className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer ${
                                        copied
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-900 hover:bg-emerald-600 text-white'
                                    }`}
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4 text-emerald-400" />}
                                    <span>{copied ? 'Link Copied' : 'Share Circle Link'}</span>
                                </button>
                            )}

                            {isOrganizer && group.status === 'FORMING' && (
                                <button
                                    onClick={() => setIsManualAddModalOpen(true)}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
                                >
                                    <UserPlus className="w-4 h-4 text-emerald-400" />
                                    <span>Manual Add</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {viewMode === 'LIST' || !isOrganizer ? (
                        <div className="bg-white rounded-2xl border-none shadow-none p-4 space-y-1">
                            {approvedMembers.length === 0 ? (
                                <div className="py-16 text-center text-slate-400">
                                    <div className="w-14 h-14 bg-slate-900 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md"><Users className="w-7 h-7" /></div>
                                    <p className="text-xs font-bold">No members enrolled yet.</p>
                                </div>
                            ) : (
                                approvedMembers.map((m, idx) => {
                                    const isGroupOrganizer = (group.organizerId as any)?._id === m.userId._id || (group.organizerId as any) === m.userId._id;
                                    return (
                                        <div key={m._id} className="p-3 hover:bg-slate-50/80 rounded-xl flex items-center justify-between gap-4 transition">
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                <span className="text-xs font-bold text-slate-400 w-5 text-right shrink-0">{idx + 1}.</span>
                                                <div className="w-9 h-9 bg-slate-900 text-emerald-400 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                                                    {m.userId.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-xs font-bold text-slate-900 truncate">{m.userId.name}</h4>
                                                        {isGroupOrganizer && (
                                                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-bold uppercase rounded-md shrink-0">
                                                                Organizer
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] font-medium text-slate-400 truncate">{m.userId.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="text-[10px] font-bold text-slate-400 hidden sm:inline-block">
                                                    Joined {m.joinedAt ? format(new Date(m.joinedAt), 'MMM dd, yyyy') : 'Enrolled'}
                                                </span>
                                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold uppercase">
                                                    Active Member
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {pendingMembers.length === 0 ? (
                                <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border-none">
                                    <p className="text-xs font-bold">No pending member applications.</p>
                                </div>
                            ) : (
                                pendingMembers.map((m) => (
                                    <div key={m._id} className="p-4 bg-white border-none shadow-none rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-10 h-10 bg-slate-900 text-emerald-400 rounded-xl flex items-center justify-center font-bold shrink-0">
                                                <User className="w-5 h-5" />
                                            </div>
                                            <div className="overflow-hidden">
                                                <h4 className="text-xs font-bold text-slate-900 truncate">{m.userId.name}</h4>
                                                <p className="text-[10px] text-slate-400 truncate">{m.userId.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                                            <button
                                                onClick={() => handleApproval(m._id, true)}
                                                disabled={!!actionLoading}
                                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                            >
                                                {actionLoading === m._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                                <span>Approve</span>
                                            </button>
                                            <button
                                                onClick={() => handleApproval(m._id, false)}
                                                disabled={!!actionLoading}
                                                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                            >
                                                {actionLoading === m._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                                <span>Reject</span>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ─── 3. CYCLES TAB ─── */}
            {activeTab === 'CYCLES' && (
                <div className="bg-transparent p-0 border-none shadow-none space-y-6">
                    {selectedCycleDetailId && cycles.find(c => c._id === selectedCycleDetailId) ? (
                        (() => {
                            const selectedCycle = cycles.find(c => c._id === selectedCycleDetailId)!;
                            const winnerUser = typeof selectedCycle.winnerMembershipId === 'object' && selectedCycle.winnerMembershipId?.userId
                                ? selectedCycle.winnerMembershipId.userId
                                : null;

                            return (
                                <div className="space-y-6">
                                    <button
                                        onClick={() => setSelectedCycleDetailId(null)}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                                    >
                                        <ArrowLeft className="w-4 h-4 text-emerald-400" />
                                        <span>Back to Cycles List</span>
                                    </button>

                                    <div className="bg-white p-6 md:p-8 rounded-2xl border-none shadow-none space-y-6">
                                        <div className="flex flex-wrap items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-black text-lg shrink-0">
                                                    #{selectedCycle.cycleNumber}
                                                </div>
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <h2 className="text-xl font-black text-slate-900">Cycle #{selectedCycle.cycleNumber} Details</h2>
                                                        <CycleStatusBadge status={selectedCycle.status} size="md" />
                                                        <PaymentCollectionBadge status={selectedCycle.paymentCollection?.status || selectedCycle.paymentCollectionStatus || 'NOT_STARTED'} size="md" />
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-0.5">Financial Cycle Details & Schedule Overview</p>
                                                </div>
                                            </div>

                                            {isOrganizer && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {selectedCycle.status === 'UPCOMING' && (
                                                        <button
                                                            onClick={() => setCycleConfirmModal({ isOpen: true, type: 'start', cycleId: selectedCycle._id, cycleNumber: selectedCycle.cycleNumber })}
                                                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                                                        >
                                                            Start Cycle
                                                        </button>
                                                    )}

                                                    {selectedCycle.status === 'ACTIVE' && (
                                                        <>
                                                            {!selectedCycle.winnerMembershipId && (
                                                                <button
                                                                    onClick={() => setCycleWinnerModal({ isOpen: true, cycleId: selectedCycle._id, cycleNumber: selectedCycle.cycleNumber })}
                                                                    className="px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                                                                >
                                                                    Record Winner
                                                                </button>
                                                            )}

                                                            {selectedCycle.winnerMembershipId && (selectedCycle.paymentCollection?.status || selectedCycle.paymentCollectionStatus || 'NOT_STARTED') === 'NOT_STARTED' && (
                                                                <button
                                                                    onClick={() => setCycleConfirmModal({ isOpen: true, type: 'openCollections', cycleId: selectedCycle._id, cycleNumber: selectedCycle.cycleNumber })}
                                                                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                                                >
                                                                    <Unlock className="w-3.5 h-3.5" />
                                                                    <span>Open Collections</span>
                                                                </button>
                                                            )}

                                                            {(selectedCycle.paymentCollection?.status || selectedCycle.paymentCollectionStatus) === 'OPEN' && (
                                                                <button
                                                                    onClick={() => setCycleConfirmModal({ isOpen: true, type: 'closeCollections', cycleId: selectedCycle._id, cycleNumber: selectedCycle.cycleNumber })}
                                                                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                                                >
                                                                    <Lock className="w-3.5 h-3.5" />
                                                                    <span>Close Collections</span>
                                                                </button>
                                                            )}

                                                            <button
                                                                onClick={() => setCycleConfirmModal({ isOpen: true, type: 'complete', cycleId: selectedCycle._id, cycleNumber: selectedCycle.cycleNumber })}
                                                                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                                                            >
                                                                Complete Cycle
                                                            </button>
                                                        </>
                                                    )}

                                                    <button
                                                        onClick={() => navigate(`/cycles/${selectedCycle._id}/collections`)}
                                                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                                                    >
                                                        <LayoutDashboard className="w-3.5 h-3.5 text-emerald-600" />
                                                        <span>Collection Dashboard</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="p-4 bg-slate-50 rounded-xl border-none">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Scheduled Start</span>
                                                <span className="text-xs font-bold text-slate-900 mt-1 block">
                                                    {format(new Date(selectedCycle.scheduledStartDate), 'PPP')}
                                                </span>
                                            </div>

                                            <div className="p-4 bg-slate-50 rounded-xl border-none">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Actual Start</span>
                                                <span className="text-xs font-bold text-emerald-600 mt-1 block">
                                                    {selectedCycle.actualStartDate ? format(new Date(selectedCycle.actualStartDate), 'PPP') : 'Not Started'}
                                                </span>
                                            </div>

                                            <div className="p-4 bg-slate-50 rounded-xl border-none">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Auction Date</span>
                                                <span className="text-xs font-bold text-slate-900 mt-1 block">
                                                    {selectedCycle.auctionDate ? format(new Date(selectedCycle.auctionDate), 'PPP') : 'N/A'}
                                                </span>
                                            </div>

                                            <div className="p-4 bg-slate-50 rounded-xl border-none">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Completed Date</span>
                                                <span className="text-xs font-bold text-slate-900 mt-1 block">
                                                    {selectedCycle.actualEndDate ? format(new Date(selectedCycle.actualEndDate), 'PPP') : 'In Progress'}
                                                </span>
                                            </div>
                                        </div>

                                        {selectedCycle.winnerMembershipId ? (
                                            <div className="p-5 bg-slate-50 rounded-xl border-none space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Trophy className="w-5 h-5 text-amber-500" />
                                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Auction Winner</h4>
                                                </div>
                                                <p className="text-sm font-bold text-slate-900">
                                                    {winnerUser?.name || 'Member Winner'}
                                                </p>
                                                {selectedCycle.winningBidAmount && (
                                                    <p className="text-xs text-slate-600 font-semibold">
                                                        Winning Bid Amount: <strong className="text-slate-900">{formatCurrency(selectedCycle.winningBidAmount, (group as any)?.financialConfig?.currency)}</strong>
                                                        {selectedCycle.winningBidPercentage && ` (${selectedCycle.winningBidPercentage}%)`}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-500 font-medium">
                                                No winner recorded for this cycle yet.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()
                    ) : (
                        <>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                                        <Calendar className="w-4 h-4" />
                                        <span>Cycle Management</span>
                                    </div>
                                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Financial Cycles & Timeline</h2>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="flex bg-slate-100 p-1 rounded-xl">
                                        <button
                                            onClick={() => setCycleViewMode('LIST')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                                cycleViewMode === 'LIST' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                                            }`}
                                        >
                                            <List className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
                                            <span>List View</span>
                                        </button>
                                        <button
                                            onClick={() => setCycleViewMode('TIMELINE')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                                cycleViewMode === 'TIMELINE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                                            }`}
                                        >
                                            <Calendar className="w-3.5 h-3.5 inline mr-1 text-blue-600" />
                                            <span>Roadmap Timeline</span>
                                        </button>
                                    </div>

                                    {isOrganizer && (
                                        <button
                                            onClick={() => setIsCreateCycleModalOpen(true)}
                                            className="px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                                        >
                                            <PlusCircle className="w-4 h-4 text-emerald-400" />
                                            <span>Create Cycle #{nextCycleNumber}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <CycleStatistics cycles={cycles} totalDurationMonths={group.totalMembers} />

                            {cyclesLoading ? (
                                <div className="py-12 flex justify-center"><Loader size="md" /></div>
                            ) : cycleViewMode === 'TIMELINE' ? (
                                <CycleTimeline cycles={filteredCycles} currency={(group as any).financialConfig?.currency} onSelectCycle={(id) => setSelectedCycleDetailId(id)} />
                            ) : (
                                <CycleTable
                                    cycles={cycles}
                                    isOrganizer={isOrganizer}
                                    actionLoading={cycleActionLoading}
                                    currency={(group as any).financialConfig?.currency}
                                    onStart={(id) => {
                                        const c = cycles.find((cyc) => cyc._id === id);
                                        setCycleConfirmModal({ isOpen: true, type: 'start', cycleId: id, cycleNumber: c?.cycleNumber || 0 });
                                    }}
                                    onComplete={(id) => {
                                        const c = cycles.find((cyc) => cyc._id === id);
                                        setCycleConfirmModal({ isOpen: true, type: 'complete', cycleId: id, cycleNumber: c?.cycleNumber || 0 });
                                    }}
                                    onCancel={(id) => {
                                        const c = cycles.find((cyc) => cyc._id === id);
                                        setCycleConfirmModal({ isOpen: true, type: 'cancel', cycleId: id, cycleNumber: c?.cycleNumber || 0 });
                                    }}
                                    onRecordWinner={(id) => {
                                        const c = cycles.find((cyc) => cyc._id === id);
                                        setCycleWinnerModal({ isOpen: true, cycleId: id, cycleNumber: c?.cycleNumber || 0 });
                                    }}
                                    onViewDetails={(id) => setSelectedCycleDetailId(id)}
                                />
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ─── 4. AUCTIONS TAB ─── */}
            {activeTab === 'AUCTIONS' && (
                <div className="bg-transparent p-0 border-none shadow-none space-y-6">
                    {selectedBiddingRoomId ? (
                        <EmbeddedBiddingRoom
                            auctionId={selectedBiddingRoomId}
                            user={user}
                            onBack={() => setSelectedBiddingRoomId(null)}
                            backLabel={auctionViewOrigin === 'DETAILS' ? 'Back to Auction Details' : 'Back to Auctions List'}
                        />
                    ) : selectedAuctionDetailId && auctions.find(a => a._id === selectedAuctionDetailId) ? (
                        (() => {
                            const selectedAuction = auctions.find(a => a._id === selectedAuctionDetailId)!;
                            const cycleNum = typeof selectedAuction.cycleId === 'object' ? selectedAuction.cycleId.cycleNumber : selectedAuction.auctionNumber;
                            const isWinnerDeclared = selectedAuction.status === 'WINNER_DECLARED' || !!selectedAuction.winningMembershipId;

                            return (
                                <div className="space-y-6">
                                    <button
                                        onClick={() => setSelectedAuctionDetailId(null)}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                                    >
                                        <ArrowLeft className="w-4 h-4 text-emerald-400" />
                                        <span>Back to Auctions List</span>
                                    </button>

                                    <div className="bg-white p-6 md:p-8 rounded-2xl border-none shadow-none space-y-6">
                                        <div className="flex flex-wrap items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-black text-lg shrink-0">
                                                    <Hammer className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <h2 className="text-xl font-black text-slate-900">Auction #{cycleNum} Details</h2>
                                                        <AuctionStatusBadge status={selectedAuction.status} size="md" />
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-0.5">Monthly Member Auction Details & Schedule</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        const id = selectedAuction._id;
                                                        setAuctionViewOrigin('DETAILS');
                                                        setSelectedBiddingRoomId(id);
                                                    }}
                                                    className="px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                                                >
                                                    <Hammer className="w-3.5 h-3.5 text-emerald-400" />
                                                    <span>Open Bidding Room</span>
                                                </button>

                                                {isOrganizer && (
                                                    <>
                                                        {selectedAuction.status === 'SCHEDULED' && (
                                                            <button
                                                                onClick={() => setAuctionConfirmModal({ isOpen: true, type: 'start', auctionId: selectedAuction._id, auctionNumber: selectedAuction.auctionNumber })}
                                                                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                                                            >
                                                                Start Auction
                                                            </button>
                                                        )}
                                                        {selectedAuction.status === 'OPEN' && (
                                                            <>
                                                                <button
                                                                    onClick={() => setAuctionConfirmModal({ isOpen: true, type: 'close', auctionId: selectedAuction._id, auctionNumber: selectedAuction.auctionNumber })}
                                                                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                                                                >
                                                                    Close Bidding
                                                                </button>
                                                                <button
                                                                    onClick={() => setAuctionWinnerModal({ isOpen: true, auctionId: selectedAuction._id, auctionNumber: selectedAuction.auctionNumber })}
                                                                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                                                                >
                                                                    Declare Winner
                                                                </button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Bid Limits Info */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border-none text-xs">
                                            <div>
                                                <span className="text-slate-400 font-bold block text-[10px] uppercase">Min Bid Limit</span>
                                                <span className="font-bold text-slate-900 text-sm mt-0.5 block">{selectedAuction.minimumBidPercentage}%</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-bold block text-[10px] uppercase">Max Bid Limit</span>
                                                <span className="font-bold text-slate-900 text-sm mt-0.5 block">{selectedAuction.maximumBidPercentage}%</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-bold block text-[10px] uppercase">Scheduled Start</span>
                                                <span className="font-bold text-slate-900 text-sm mt-0.5 block">{format(new Date(selectedAuction.scheduledStartTime), 'MMM dd, yyyy')}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-bold block text-[10px] uppercase">Status</span>
                                                <span className="font-bold text-slate-900 text-sm mt-0.5 block">{selectedAuction.status}</span>
                                            </div>
                                        </div>

                                        {/* Winner Banner if Declared */}
                                        {isWinnerDeclared && (
                                            <WinnerBanner
                                                winner={selectedAuction.winningMembershipId || null}
                                                winningBidPercentage={selectedAuction.minimumBidPercentage}
                                                remarks={selectedAuction.remarks}
                                            />
                                        )}

                                        {/* Timeline component */}
                                        <AuctionTimeline auction={selectedAuction} />
                                    </div>
                                </div>
                            );
                        })()
                    ) : (
                        <>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                                        <Hammer className="w-4 h-4" />
                                        <span>Auction & Bidding System</span>
                                    </div>
                                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Member Auctions & Bids</h2>
                                </div>

                                {isOrganizer && (
                                    <button
                                        onClick={() => setIsScheduleAuctionModalOpen(true)}
                                        className="px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                                    >
                                        <PlusCircle className="w-4 h-4 text-emerald-400" />
                                        <span>Schedule Auction</span>
                                    </button>
                                )}
                            </div>

                            {liveAuction && (
                                <div className="p-6 bg-white rounded-2xl border-none space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                                            <span>Live Auction in Progress</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-slate-400">Auction #{liveAuction.auctionNumber}</span>
                                            <button
                                                onClick={() => {
                                                    setAuctionViewOrigin('LIST');
                                                    setSelectedBiddingRoomId(liveAuction._id);
                                                }}
                                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                            >
                                                <Hammer className="w-3.5 h-3.5" />
                                                <span>Enter Bidding Room</span>
                                            </button>
                                        </div>
                                    </div>
                                    <CountdownTimer targetDate={liveAuction.scheduledEndTime || liveAuction.scheduledStartTime} />
                                </div>
                            )}

                            {auctionsLoading ? (
                                <div className="py-12 flex justify-center"><Loader size="md" /></div>
                            ) : (
                                <AuctionTable
                                    auctions={auctions}
                                    isOrganizer={isOrganizer}
                                    actionLoading={auctionActionLoading}
                                    currency={(group as any).financialConfig?.currency}
                                    onStart={(id) => {
                                        const a = auctions.find((auc) => auc._id === id);
                                        setAuctionConfirmModal({ isOpen: true, type: 'start', auctionId: id, auctionNumber: a?.auctionNumber });
                                    }}
                                    onCloseAuction={(id) => {
                                        const a = auctions.find((auc) => auc._id === id);
                                        setAuctionConfirmModal({ isOpen: true, type: 'close', auctionId: id, auctionNumber: a?.auctionNumber });
                                    }}
                                    onCancel={(id) => {
                                        const a = auctions.find((auc) => auc._id === id);
                                        setAuctionConfirmModal({ isOpen: true, type: 'cancel', auctionId: id, auctionNumber: a?.auctionNumber });
                                    }}
                                    onDeclareWinner={(id) => {
                                        const a = auctions.find((auc) => auc._id === id);
                                        setAuctionWinnerModal({ isOpen: true, auctionId: id, auctionNumber: a?.auctionNumber || 0 });
                                    }}
                                    onOpenBiddingRoom={(id) => {
                                        setAuctionViewOrigin('LIST');
                                        setSelectedBiddingRoomId(id);
                                    }}
                                    onViewDetails={(id) => setSelectedAuctionDetailId(id)}
                                    onViewBids={(id) => {
                                        setAuctionViewOrigin('LIST');
                                        setSelectedBiddingRoomId(id);
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ─── 5. INSTALLMENTS TAB ─── */}
            {activeTab === 'INSTALLMENTS' && (() => {
                const currentCycle = cycles.find(c => c._id === selectedCycleId) || cycles[0];
                const currentCollectionStatus = currentCycle?.paymentCollection?.status || currentCycle?.paymentCollectionStatus || 'NOT_STARTED';
                
                // Filter current member's personal installments in this group
                const myGroupInstallments = installments.filter(inst => {
                    const uId = typeof inst.userId === 'object' ? (inst.userId?._id || (inst.userId as any)?.id) : inst.userId;
                    return uId === currentUserIdStr;
                });
                const myPendingInstallments = myGroupInstallments.filter(i => (i.paymentStatus || i.status) !== 'PAID');
                const myTotalPendingAmount = myPendingInstallments.reduce((sum, item) => sum + (item.amount || 0) + (item.lateFee || 0) - (item.paidAmount || 0), 0);

                return (
                    <div className="bg-transparent p-0 border-none shadow-none space-y-6">
                        {/* Header Banner & Cycle Selector */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                                    <Coins className="w-4 h-4" />
                                    <span>Financial Collections & Dues</span>
                                </div>
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">Installments & Member Dues</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {isOrganizer
                                        ? 'Manage payment collections, generate monthly dues, and track member payments.'
                                        : 'View your monthly installment dues, payment status, and make online payments.'
                                    }
                                </p>
                            </div>

                            {/* Cycle Selector & Actions */}
                            <div className="flex flex-wrap items-center gap-3">
                                <select
                                    value={selectedCycleId}
                                    onChange={(e) => setSelectedCycleId(e.target.value)}
                                    className="bg-white border-none text-slate-800 text-xs font-bold py-2.5 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer shadow-none"
                                >
                                    <option value="">All Cycles / Select Cycle...</option>
                                    {cycles.map((c) => (
                                        <option key={c._id} value={c._id}>
                                            Cycle #{c.cycleNumber} ({c.status})
                                        </option>
                                    ))}
                                </select>

                                {isOrganizer && selectedCycleId && (
                                    <button
                                        onClick={() => generateCycleInstallments(selectedCycleId)}
                                        disabled={installmentActionLoading === 'generate'}
                                        className="px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-none"
                                    >
                                        {installmentActionLoading === 'generate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-emerald-400" />}
                                        <span>Generate Cycle Dues</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ─── 1. ORGANIZER PAYMENT COLLECTION CONTROL PANEL ─── */}
                        {isOrganizer && currentCycle && (
                            <div className="bg-white p-6 md:p-8 rounded-2xl border-none shadow-none space-y-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-black shrink-0">
                                            <Unlock className="w-5 h-5 md:w-6 md:h-6" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2.5">
                                                <h3 className="text-base md:text-lg font-black text-slate-900">
                                                    Cycle #{currentCycle.cycleNumber} Collection Management
                                                </h3>
                                                <PaymentCollectionBadge status={currentCollectionStatus} size="sm" />
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {currentCollectionStatus === 'OPEN'
                                                    ? 'Collections are currently open. Members are permitted to make installment payments online.'
                                                    : currentCollectionStatus === 'CLOSED'
                                                        ? 'Collections are closed for this cycle. Member payments are locked.'
                                                        : 'Collections have not been started. Members are blocked from submitting payments.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action Buttons for Organizer */}
                                    <div className="flex flex-wrap items-center gap-3">
                                        {/* If NOT_STARTED and winner declared: Open Collections Button */}
                                        {currentCollectionStatus === 'NOT_STARTED' && (
                                            currentCycle.winnerMembershipId ? (
                                                <button
                                                    onClick={() => setCycleConfirmModal({ isOpen: true, type: 'openCollections', cycleId: currentCycle._id, cycleNumber: currentCycle.cycleNumber })}
                                                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-none active:scale-95 flex items-center gap-2"
                                                >
                                                    <Unlock className="w-4 h-4" />
                                                    <span>Open Collections</span>
                                                </button>
                                            ) : (
                                                <div className="px-4 py-2.5 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-2 border-none">
                                                    <Info className="w-4 h-4 text-amber-500 shrink-0" />
                                                    <span>Declare Auction Winner to Open Collections</span>
                                                </div>
                                            )
                                        )}

                                        {/* If OPEN: Close Collections Button */}
                                        {currentCollectionStatus === 'OPEN' && (
                                            <button
                                                onClick={() => setCycleConfirmModal({ isOpen: true, type: 'closeCollections', cycleId: currentCycle._id, cycleNumber: currentCycle.cycleNumber })}
                                                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-none active:scale-95 flex items-center gap-2"
                                            >
                                                <Lock className="w-4 h-4" />
                                                <span>Close Collections</span>
                                            </button>
                                        )}

                                        {/* If CLOSED: Closed Badge */}
                                        {currentCollectionStatus === 'CLOSED' && (
                                            <span className="px-4 py-2 bg-slate-50 text-slate-500 text-xs font-bold rounded-xl border-none">
                                                Collections Finalized
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Cycle Context Summary Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border-none text-xs">
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Active Cycle</span>
                                        <span className="text-sm font-black text-slate-900 mt-0.5 block">Cycle #{currentCycle.cycleNumber}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Cycle Status</span>
                                        <span className="text-sm font-black text-emerald-600 mt-0.5 block">{currentCycle.status}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Auction Winner</span>
                                        <span className="text-sm font-black text-slate-900 mt-0.5 block">
                                            {typeof currentCycle.winnerMembershipId === 'object' && currentCycle.winnerMembershipId?.userId?.name
                                                ? currentCycle.winnerMembershipId.userId.name
                                                : currentCycle.winnerMembershipId ? 'Recorded' : 'Not Declared'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Net Prize Amount</span>
                                        <span className="text-sm font-black text-slate-900 mt-0.5 block">
                                            {currentCycle.prizeAmount ? formatCurrency(currentCycle.prizeAmount, (group as any)?.financialConfig?.currency) : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── 2. MEMBER PERSONAL DUES & PAY NOW SECTION (EXTENDED FULL WIDTH) ─── */}
                        {myGroupInstallments.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                                            <Wallet className="w-4 h-4" />
                                            <span>Member Contribution</span>
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900 tracking-tight">
                                            My Installment Dues ({myGroupInstallments.length})
                                        </h3>
                                    </div>
                                    {myPendingInstallments.length > 0 && (
                                        <span className="px-3 py-1 bg-amber-50 text-amber-800 text-xs font-bold rounded-xl border-none">
                                            {myPendingInstallments.length} Due Pending ({formatCurrency(myTotalPendingAmount, (group as any)?.financialConfig?.currency)})
                                        </span>
                                    )}
                                </div>

                                {/* Full-Width Stack of Installment Cards */}
                                <div className="space-y-4">
                                    {myGroupInstallments.map((inst) => {
                                        const cycleObj = typeof inst.cycleId === 'object' ? inst.cycleId : cycles.find(c => c._id === inst.cycleId);
                                        const colStatus = (cycleObj as any)?.paymentCollection?.status || (cycleObj as any)?.paymentCollectionStatus || 'NOT_STARTED';
                                        const isPaid = (inst.paymentStatus || inst.status) === 'PAID';
                                        const netPayable = (inst.amount || 0) + (inst.lateFee || 0) - (inst.paidAmount || 0);

                                        return (
                                            <div
                                                key={inst._id}
                                                className="w-full bg-white p-6 md:p-8 rounded-2xl border-none shadow-none space-y-6 transition-all"
                                            >
                                                {/* Header Row */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-black text-sm shrink-0">
                                                            #{inst.installmentNumber}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="text-base font-black text-slate-900">Installment #{inst.installmentNumber}</h4>
                                                                <span className="text-xs font-bold text-slate-400">
                                                                    (Cycle #{typeof inst.cycleId === 'object' ? (inst.cycleId as any).cycleNumber : (cycles.find(c => c._id === inst.cycleId)?.cycleNumber || inst.installmentNumber)})
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-400 mt-0.5">
                                                                Due Date: <strong className="text-slate-700 font-bold">{inst.dueDate ? format(new Date(inst.dueDate), 'MMMM dd, yyyy') : 'N/A'}</strong>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <PaymentStatusBadge status={inst.paymentStatus || inst.status || 'PENDING'} size="md" />
                                                        <PaymentCollectionBadge status={colStatus} size="md" />
                                                    </div>
                                                </div>

                                                {/* Full-Width Metrics Grid */}
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 md:p-5 rounded-xl border-none text-xs">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Base Contribution</span>
                                                        <span className="text-base font-black text-slate-900 mt-1 block">
                                                            {formatCurrency(inst.amount, (group as any)?.financialConfig?.currency)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Accrued Late Fee</span>
                                                        <span className={`text-base font-black mt-1 block ${inst.lateFee > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                                            {formatCurrency(inst.lateFee || 0, (group as any)?.financialConfig?.currency)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Paid Amount</span>
                                                        <span className="text-base font-black text-emerald-600 mt-1 block">
                                                            {formatCurrency(inst.paidAmount || 0, (group as any)?.financialConfig?.currency)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Net Remaining</span>
                                                        <span className={`text-base font-black mt-1 block ${netPayable > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                            {formatCurrency(netPayable, (group as any)?.financialConfig?.currency)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Full-Width Action Banner */}
                                                <div>
                                                    {isPaid ? (
                                                        <div className="w-full p-4 bg-emerald-50 text-emerald-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-bold border-none">
                                                            <div className="flex items-center gap-2">
                                                                <Check className="w-4 h-4 text-emerald-600" />
                                                                <span>Installment Paid Successfully</span>
                                                            </div>
                                                            {inst.paidDate && (
                                                                <span className="text-emerald-600 font-medium">
                                                                    Paid On: {format(new Date(inst.paidDate), 'MMMM dd, yyyy')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : colStatus === 'OPEN' ? (
                                                        <button
                                                            onClick={() => setSelectedPaymentInstallment(inst)}
                                                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-none active:scale-95"
                                                        >
                                                            <CreditCard className="w-4 h-4" />
                                                            <span>Pay Now ({formatCurrency(netPayable, (group as any)?.financialConfig?.currency)})</span>
                                                        </button>
                                                    ) : colStatus === 'CLOSED' ? (
                                                        <div className="w-full py-3 px-4 bg-slate-50 text-slate-500 rounded-xl text-xs font-bold text-center border-none">
                                                            Collections for this cycle have been closed.
                                                        </div>
                                                    ) : (
                                                        <div className="w-full py-3 px-4 bg-slate-50 text-slate-500 rounded-xl text-xs font-bold text-center border-none">
                                                            Collections have not been opened by the organizer yet.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Financial Analytics */}
                        {stats && <StatisticsCards stats={stats} />}

                        {stats && (
                            <CollectionProgress
                                collectedAmount={stats.totalCollectedAmount}
                                expectedAmount={stats.totalExpectedAmount}
                                percentage={stats.collectionPercentage}
                            />
                        )}

                        {/* Full Installments Table */}
                        {installmentsLoading ? (
                            <div className="py-12 flex justify-center"><Loader size="md" /></div>
                        ) : (
                            <InstallmentTable
                                installments={installments}
                                isOrganizer={isOrganizer}
                                isAdmin={isAdmin}
                                currentUserId={currentUserIdStr}
                                actionLoading={installmentActionLoading}
                                currency={(group as any)?.financialConfig?.currency}
                                onWaiveLateFee={(id) => setConfirmWaive({ isOpen: true, installmentId: id })}
                                onPayNow={(inst) => setSelectedPaymentInstallment(inst)}
                            />
                        )}
                    </div>
                );
            })()}

            {/* ─── 6. NEED HELP TAB ─── */}
            {activeTab === 'HELP' && (
                <NeedHelpTab group={group} isOrganizer={isOrganizer} />
            )}

            {/* ─── MODALS ─── */}

            {/* Manual Add Member Modal */}
            {isManualAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
                        onClick={() => {
                            if (!isAdding) {
                                setIsManualAddModalOpen(false);
                                setSearchResult(null);
                                setSearchError(null);
                                setSearchEmail('');
                            }
                        }}
                    />
                    <div className="relative bg-white/90 backdrop-blur-md w-full max-w-md rounded-3xl shadow-2xl overflow-hidden z-10 border border-white/60 p-6 space-y-6">
                        <div className="text-center space-y-1">
                            <h3 className="text-base font-bold text-slate-900">Manual Member Enrollment</h3>
                            <p className="text-xs text-slate-500">Enroll KYC verified users directly into your group</p>
                        </div>

                        <div className="space-y-4">
                            <div className="relative">
                                <input
                                    type="email"
                                    placeholder="Enter member's exact email..."
                                    value={searchEmail}
                                    onChange={(e) => setSearchEmail(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
                                    className="w-full bg-white/60 border border-slate-200 py-3 px-4 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                                />
                                <button
                                    onClick={handleSearchUser}
                                    disabled={isSearching || !searchEmail}
                                    className="absolute right-2 top-2 bottom-2 px-4 bg-slate-900 text-white rounded-lg text-xs font-bold uppercase hover:bg-emerald-600 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                                </button>
                            </div>

                            {searchError && (
                                <p className="p-3 text-center text-xs font-bold text-rose-600 bg-rose-50 rounded-xl border border-rose-200">
                                    {searchError}
                                </p>
                            )}

                            {searchResult && (
                                <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-900 text-emerald-400 rounded-xl flex items-center justify-center shadow-xs font-bold text-sm">
                                            {searchResult.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-900">{searchResult.name}</h4>
                                            <p className="text-[11px] text-slate-500">{searchResult.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/10 text-emerald-700 rounded-lg w-fit text-[10px] font-bold">
                                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                        <span>KYC Approved Member</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                onClick={() => {
                                    setIsManualAddModalOpen(false);
                                    setSearchResult(null);
                                    setSearchError(null);
                                    setSearchEmail('');
                                }}
                                disabled={isAdding}
                                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleManualAdd}
                                disabled={!searchResult || isAdding}
                                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-md cursor-pointer disabled:opacity-40"
                            >
                                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                                <span>Enroll Member</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Cycle Modal */}
            <CreateCycleModal
                isOpen={isCreateCycleModalOpen}
                nextCycleNumber={nextCycleNumber}
                onClose={() => setIsCreateCycleModalOpen(false)}
                onSubmit={async (data) => {
                    await createCycle({ ...data, groupId: id! });
                    setIsCreateCycleModalOpen(false);
                }}
            />

            {/* Cycle Record Winner Modal */}
            <RecordWinnerModal
                isOpen={cycleWinnerModal.isOpen}
                cycleNumber={cycleWinnerModal.cycleNumber}
                members={memberOptions}
                onClose={() => setCycleWinnerModal({ isOpen: false, cycleId: null, cycleNumber: 0 })}
                onSubmit={async (data: RecordWinnerFormData) => {
                    if (cycleWinnerModal.cycleId) {
                        await recordCycleWinner(cycleWinnerModal.cycleId, data);
                        setCycleWinnerModal({ isOpen: false, cycleId: null, cycleNumber: 0 });
                    }
                }}
            />

            {/* Cycle Confirmation Dialog */}
            <ConfirmationDialog
                isOpen={cycleConfirmModal.isOpen}
                title={
                    cycleConfirmModal.type === 'openCollections'
                        ? `Open Collections for Cycle #${cycleConfirmModal.cycleNumber}?`
                        : cycleConfirmModal.type === 'closeCollections'
                            ? `Close Collections for Cycle #${cycleConfirmModal.cycleNumber}?`
                            : `${cycleConfirmModal.type?.toUpperCase()} Cycle #${cycleConfirmModal.cycleNumber}?`
                }
                description={
                    cycleConfirmModal.type === 'openCollections'
                        ? 'Opening payment collections will allow members to initiate installment payments for this cycle.'
                        : cycleConfirmModal.type === 'closeCollections'
                            ? 'Closing payment collections will prevent members from making further payments for this cycle.'
                            : `Are you sure you want to ${cycleConfirmModal.type} cycle #${cycleConfirmModal.cycleNumber}?`
                }
                confirmLabel={
                    cycleConfirmModal.type === 'openCollections'
                        ? 'Open Collections'
                        : cycleConfirmModal.type === 'closeCollections'
                            ? 'Close Collections'
                            : cycleConfirmModal.type || 'Confirm'
                }
                confirmVariant={cycleConfirmModal.type === 'cancel' || cycleConfirmModal.type === 'closeCollections' ? 'rose' : 'emerald'}
                onCancel={() => setCycleConfirmModal({ isOpen: false, type: null, cycleId: null })}
                onConfirm={handleConfirmCycleAction}
            />

            {/* Schedule Auction Modal */}
            <ScheduleAuctionModal
                isOpen={isScheduleAuctionModalOpen}
                cycles={cycleOptionsForAuctions}
                onClose={() => setIsScheduleAuctionModalOpen(false)}
                onSubmit={async (data: ScheduleAuctionFormData) => {
                    await createAuction(data);
                    setIsScheduleAuctionModalOpen(false);
                }}
            />

            {/* Auction Record Winner Modal */}
            <RecordWinnerModal
                isOpen={auctionWinnerModal.isOpen}
                cycleNumber={auctionWinnerModal.auctionNumber}
                members={memberOptions}
                onClose={() => setAuctionWinnerModal({ isOpen: false, auctionId: null, auctionNumber: 0 })}
                onSubmit={async (data: RecordWinnerFormData) => {
                    if (auctionWinnerModal.auctionId) {
                        const input: DeclareAuctionWinnerInput = {
                            winningMembershipId: data.winnerMembershipId,
                            remarks: data.remarks
                        };
                        await declareAuctionWinner(auctionWinnerModal.auctionId, input);
                        setAuctionWinnerModal({ isOpen: false, auctionId: null, auctionNumber: 0 });
                    }
                }}
            />

            {/* Auction Confirmation Dialog */}
            <ConfirmationDialog
                isOpen={auctionConfirmModal.isOpen}
                title={`${auctionConfirmModal.type?.toUpperCase()} Auction #${auctionConfirmModal.auctionNumber}?`}
                description={`Are you sure you want to ${auctionConfirmModal.type} auction #${auctionConfirmModal.auctionNumber}?`}
                confirmLabel={auctionConfirmModal.type || 'Confirm'}
                confirmVariant={auctionConfirmModal.type === 'cancel' ? 'rose' : 'emerald'}
                onCancel={() => setAuctionConfirmModal({ isOpen: false, type: null, auctionId: null })}
                onConfirm={handleConfirmAuctionAction}
            />

            {/* Active PayNowModal for Member Payments */}
            {selectedPaymentInstallment && (
                <PayNowModal
                    isOpen={!!selectedPaymentInstallment}
                    installment={selectedPaymentInstallment}
                    currency={(group as any)?.financialConfig?.currency}
                    onClose={() => setSelectedPaymentInstallment(null)}
                    onPaymentSuccess={() => {
                        setSelectedPaymentInstallment(null);
                        fetchDetails();
                        refetchInstallments();
                        refetchCycles();
                    }}
                />
            )}

            {/* Waive Fee Confirmation Dialog */}
            <ConfirmationDialog
                isOpen={confirmWaive.isOpen}
                title="Waive Accrued Late Fee?"
                description="Are you sure you want to waive the late fee for this installment?"
                confirmLabel="Waive Fee"
                confirmVariant="emerald"
                onCancel={() => setConfirmWaive({ isOpen: false, installmentId: null })}
                onConfirm={handleConfirmWaive}
            />
        </div>
    );
};
