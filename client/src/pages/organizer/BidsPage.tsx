import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useBids } from '../../hooks/useBids';
import * as auctionApi from '../../api/auction.api';
import api from '../../api/axios';
import type { Auction } from '../../types/auction';
import type { Bid } from '../../types/bid';
import { AuctionStatusBadge } from '../../components/auctions/AuctionStatusBadge';
import { CountdownTimer } from '../../components/auctions/CountdownTimer';
import { WinnerBanner } from '../../components/auctions/WinnerBanner';
import { BidForm } from '../../components/bids/BidForm';
import { BidCard } from '../../components/bids/BidCard';
import { BidTable } from '../../components/bids/BidTable';
import { BidHistory } from '../../components/bids/BidHistory';
import { BidConfirmationModal } from '../../components/bids/BidConfirmationModal';
import { LoadingSkeleton } from '../../components/cycles/LoadingSkeleton';
import { ArrowLeft, Hammer, RefreshCw, ShieldCheck, AlertCircle, Info, Coins, Clock } from 'lucide-react';

import { useChitSidebar } from '../../context/ChitSidebarContext';

export const BidsPage = () => {
    const { auctionId } = useParams<{ auctionId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { setGroup: setSidebarGroup, setActiveTab: setSidebarActiveTab, setIsOrganizer: setSidebarIsOrganizer } = useChitSidebar();

    const [auction, setAuction] = useState<Auction | null>(null);
    const [groupMembers, setGroupMembers] = useState<any[]>([]);
    const [auctionLoading, setAuctionLoading] = useState(true);

    const [activeBiddingTab, setActiveBiddingTab] = useState<'SUBMITTED_BIDS' | 'MY_BID' | 'HISTORY'>('SUBMITTED_BIDS');

    const [editingBid, setEditingBid] = useState<Bid | null>(null);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: 'submit' | 'update' | 'withdraw' | null;
        bidPercentage?: number;
        bidAmount?: number;
        bidId?: string;
        pendingInput?: any;
    }>({ isOpen: false, type: null });

    const {
        bids,
        myActiveBid,
        loading: bidsLoading,
        actionLoading,
        error: bidsError,
        refetch: refetchBids,
        submitBid,
        updateBid,
        withdrawBid
    } = useBids(auctionId, user?.id);

    useEffect(() => {
        if (!auctionId) return;
        const fetchAuctionAndMembers = async () => {
            try {
                const data = await auctionApi.fetchAuctionDetails(auctionId);
                setAuction(data);

                const grpId = typeof data.groupId === 'object' ? data.groupId._id : data.groupId;
                if (grpId) {
                    const groupRes = await api.get(`/chit-groups/details/${grpId}`);
                    setGroupMembers(groupRes.data.data.members || []);
                    if (groupRes.data.data.group) {
                        setSidebarGroup(groupRes.data.data.group);
                        setSidebarActiveTab('AUCTIONS');
                        setSidebarIsOrganizer(user?.id === groupRes.data.data.group.organizerId._id);
                    }
                }
            } catch (err) {
                console.error('Failed to load auction context:', err);
            } finally {
                setAuctionLoading(false);
            }
        };

        fetchAuctionAndMembers();
    }, [auctionId]);

    if (auctionLoading) return <LoadingSkeleton />;

    if (!auction) {
        return (
            <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
                <h3 className="text-lg font-bold text-slate-900">Auction Not Found</h3>
                <button
                    onClick={() => navigate(-1)}
                    className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
                >
                    Go Back
                </button>
            </div>
        );
    }

    const currentUserId = user?.id || (user as any)?._id;
    const groupObj = typeof auction.groupId === 'object' ? auction.groupId : null;
    const orgId = typeof auction.organizerId === 'object' ? (auction.organizerId as any)?._id : auction.organizerId;
    const groupOrgId = groupObj ? ((groupObj as any).organizerId?._id || (groupObj as any).organizerId) : null;

    const isOrganizer = String(currentUserId) === String(orgId) || String(currentUserId) === String(groupOrgId) || user?.role === 'ADMIN' || user?.role === 'ORGANIZER';
    const isMember = groupMembers.some((m) => {
        const uId = typeof m.userId === 'object' ? (m.userId?._id || (m.userId as any)?.id) : m.userId;
        return String(uId) === String(currentUserId) && ['APPROVED', 'ACTIVE_MEMBER', 'ACTIVE'].includes(m.status);
    });

    const monthlyContribution = groupObj?.monthlyContribution || 0;
    const totalMembers = groupObj?.totalMembers || 0;
    const isAuctionOpen = auction.status === 'OPEN';

    const myUserBids = bids.filter((b) => {
        const uId = typeof b.userId === 'object' ? (b.userId?._id || (b.userId as any)?.id) : b.userId;
        return String(uId) === String(currentUserId);
    });

    const handleFormSubmit = async (data: { bidPercentage: number; bidAmount: number; remarks?: string }) => {
        if (myActiveBid && !editingBid) return;

        setConfirmModal({
            isOpen: true,
            type: editingBid ? 'update' : 'submit',
            bidPercentage: data.bidPercentage,
            bidAmount: data.bidAmount,
            pendingInput: data
        });
    };

    const handleWithdrawConfirm = async () => {
        if (!confirmModal.type || !auctionId) return;

        try {
            if (confirmModal.type === 'withdraw' && confirmModal.bidId) {
                await withdrawBid(confirmModal.bidId);
            } else if (confirmModal.type === 'submit' && confirmModal.pendingInput) {
                await submitBid({
                    auctionId,
                    bidPercentage: confirmModal.pendingInput.bidPercentage,
                    bidAmount: confirmModal.pendingInput.bidAmount,
                    remarks: confirmModal.pendingInput.remarks
                });
            } else if (confirmModal.type === 'update' && editingBid && confirmModal.pendingInput) {
                await updateBid(editingBid._id, {
                    bidPercentage: confirmModal.pendingInput.bidPercentage,
                    bidAmount: confirmModal.pendingInput.bidAmount,
                    remarks: confirmModal.pendingInput.remarks
                });
                setEditingBid(null);
            }
            setConfirmModal({ isOpen: false, type: null });
        } catch (err) {
            console.error('Action failed:', err);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Back Nav */}
            <button
                onClick={() => {
                    if (auctionId) {
                        navigate(`/auctions/${auctionId}`);
                    } else {
                        navigate(-1);
                    }
                }}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition cursor-pointer"
            >
                <ArrowLeft className="w-4 h-4 text-emerald-600" />
                <span>Back to Auction Control Room</span>
            </button>

            {bidsError && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl">
                    {bidsError}
                </div>
            )}

            {/* Header Title Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                        <Hammer className="w-4 h-4" />
                        <span>Live Member Bidding Room</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                            Auction #{auction.auctionNumber} Bidding Room
                        </h1>
                        <AuctionStatusBadge status={auction.status} size="md" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        {groupObj?.name ? `Group: ${groupObj.name}` : 'Live Member Bidding System'}
                    </p>
                </div>

                <button
                    onClick={refetchBids}
                    disabled={bidsLoading}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition cursor-pointer disabled:opacity-50 shrink-0"
                    title="Refresh Bids"
                >
                    <RefreshCw className={`w-4 h-4 text-emerald-400 ${bidsLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Live Countdown if OPEN or SCHEDULED */}
            {auction.status === 'SCHEDULED' && (
                <CountdownTimer targetDate={auction.scheduledStartTime} label="Auction Starts In" />
            )}

            {auction.status === 'OPEN' && auction.scheduledEndTime && (
                <CountdownTimer targetDate={auction.scheduledEndTime} label="Bidding Closes In" />
            )}

            {/* Winner Banner if Declared */}
            {auction.winningMembershipId && (
                <WinnerBanner
                    winner={auction.winningMembershipId}
                    winningBidPercentage={auction.minimumBidPercentage}
                    remarks={auction.remarks}
                />
            )}

            {/* Bidding Room Navigation Tabs */}
            <div className="p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200/60 inline-flex flex-wrap items-center gap-1.5 w-full">
                <div className="flex items-center gap-1.5 overflow-x-auto w-full">
                    <button
                        onClick={() => setActiveBiddingTab('SUBMITTED_BIDS')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                            activeBiddingTab === 'SUBMITTED_BIDS'
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                        }`}
                    >
                        <Hammer className="w-4 h-4 text-emerald-400" />
                        <span>Submitted Bids Log</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            activeBiddingTab === 'SUBMITTED_BIDS' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200/80 text-slate-700'
                        }`}>
                            {bids.length}
                        </span>
                    </button>

                    {isMember && (
                        <button
                            onClick={() => setActiveBiddingTab('MY_BID')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                                activeBiddingTab === 'MY_BID'
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                            }`}
                        >
                            <Coins className="w-4 h-4 text-amber-400" />
                            <span>{myActiveBid ? 'My Active Bid' : 'Submit Bid'}</span>
                            {myActiveBid && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 uppercase">
                                    Active
                                </span>
                            )}
                        </button>
                    )}

                    {isMember && (
                        <button
                            onClick={() => setActiveBiddingTab('HISTORY')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                                activeBiddingTab === 'HISTORY'
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                            }`}
                        >
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span>My Bidding History</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                activeBiddingTab === 'HISTORY' ? 'bg-blue-500 text-white' : 'bg-slate-200/80 text-slate-700'
                            }`}>
                                {myUserBids.length}
                            </span>
                        </button>
                    )}

                    {isOrganizer && !isMember && (
                        <button
                            onClick={() => setActiveBiddingTab('MY_BID')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                                activeBiddingTab === 'MY_BID'
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                            }`}
                        >
                            <ShieldCheck className="w-4 h-4 text-amber-400" />
                            <span>Organizer Guide</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Tabbed Content Container */}
            <div>
                {activeBiddingTab === 'SUBMITTED_BIDS' && (
                    <BidTable bids={bids} auctionNumber={auction.auctionNumber} currency={groupObj?.financialConfig?.currency} isLoading={bidsLoading} />
                )}

                {activeBiddingTab === 'MY_BID' && (
                    <div className="w-full">
                        {isMember ? (
                            myActiveBid && !editingBid ? (
                                <div className="w-full">
                                    <BidCard
                                        bid={myActiveBid}
                                        isAuctionOpen={isAuctionOpen}
                                        currency={groupObj?.financialConfig?.currency}
                                        onEdit={(b) => setEditingBid(b)}
                                        onWithdraw={(bidId) => setConfirmModal({ isOpen: true, type: 'withdraw', bidId })}
                                    />
                                </div>
                            ) : (
                                <BidForm
                                    auctionId={auction._id}
                                    auctionStatus={auction.status}
                                    minBidPercentage={auction.minimumBidPercentage}
                                    maxBidPercentage={auction.maximumBidPercentage}
                                    monthlyContribution={monthlyContribution}
                                    totalMembers={totalMembers}
                                    currency={groupObj?.financialConfig?.currency}
                                    existingBid={editingBid || myActiveBid}
                                    isLoading={!!actionLoading}
                                    onSubmitBid={handleFormSubmit}
                                    onCancelEdit={editingBid ? () => setEditingBid(null) : undefined}
                                />
                            )
                        ) : isOrganizer ? (
                            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-black">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900">Auction Leader View</h3>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                                            ORGANIZER MODE
                                        </span>
                                    </div>
                                </div>

                                <p className="text-xs text-slate-600 leading-relaxed">
                                    You are conducting this auction as the <strong>Chit Group Organizer</strong>. As non-bidding management, you monitor live member bids via the <strong>Submitted Bids Log</strong> tab.
                                </p>

                                <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-800 space-y-1">
                                    <span className="font-bold block flex items-center gap-1">
                                        <Info className="w-3.5 h-3.5 text-amber-600" />
                                        Organizer Note:
                                    </span>
                                    <p className="text-[11px] text-amber-700">
                                        If you also wish to participate as a bidding member in this chit group, enroll yourself as a member in the group details page.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
                                <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                                    <AlertCircle className="w-5 h-5" />
                                    <span>Bidding Restricted</span>
                                </div>
                                <p className="text-xs text-slate-600">
                                    You must be an approved active member of this Chit Group to submit auction bids.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {activeBiddingTab === 'HISTORY' && (
                    <div className="w-full">
                        <BidHistory bids={myUserBids} />
                    </div>
                )}
            </div>

            {/* Confirmation Dialog */}
            <BidConfirmationModal
                isOpen={confirmModal.isOpen}
                type={confirmModal.type}
                bidPercentage={confirmModal.bidPercentage}
                bidAmount={confirmModal.bidAmount}
                isLoading={!!actionLoading}
                onConfirm={handleWithdrawConfirm}
                onCancel={() => setConfirmModal({ isOpen: false, type: null })}
            />
        </div>
    );
};
