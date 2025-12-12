"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  patientFinanceAPI,
  insuranceAPI,
  PendingPaymentItem,
  InsurancePolicy,
  SavedPaymentCard,
} from "@/services/api";
import Image from "next/image";
import Link from "next/link";

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function FinancePage() {
  const { user: _user } = useAuth();
  const [allPayments, setAllPayments] = useState<PendingPaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PendingPaymentItem | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cheque" | "insurance" | null>(null);
  
  // Filter states for transaction history
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentType, setFilterPaymentType] = useState<string>("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  
  // Sorting states for transaction history
  const [sortField, setSortField] = useState<string>("appointment_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Pagination for transaction history
  const [visibleTransactions, setVisibleTransactions] = useState(10);

  const fetchPendingPayments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await patientFinanceAPI.getPendingPayments();
      setAllPayments(data);
    } catch (err: any) {
      setError(err.detail || "Failed to load pending payments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  const handlePaymentSuccess = () => {
    setSelectedPayment(null);
    setPaymentMethod(null);
    setShowPaymentDialog(false);
    fetchPendingPayments();
  };

  // Separate pending payments (Section 1) - only those NOT initiated yet (no payment_method)
  const pendingPayments = useMemo(() => {
    return allPayments.filter(p => 
      (!p.payment_status || p.payment_status === "pending" || p.payment_status === "draft") &&
      !p.payment_method // Not initiated yet
    );
  }, [allPayments]);

  // Payments awaiting doctor approval (Section 1b) - initiated but pending approval
  const pendingApprovalPayments = useMemo(() => {
    return allPayments.filter(p => 
      p.payment_status === "pending" &&
      p.payment_method && // Has payment method (cheque or insurance)
      (p.payment_method === "cheque" || p.payment_method === "insurance")
    );
  }, [allPayments]);

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    const totalDues = allPayments.reduce((sum, p) => sum + p.final_amount, 0);
    const insuranceClaims = allPayments.filter(p => p.payment_method === "insurance").length;
    const approvedClaims = allPayments.filter(p => p.payment_status === "completed" || p.payment_status === "paid").length;
    const pendingClaims = allPayments.filter(p => !p.payment_status || p.payment_status === "pending").length;
    
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const dueWithin30Days = allPayments
      .filter(p => {
        const appointmentDate = new Date(p.appointment_date);
        return appointmentDate <= thirtyDaysFromNow;
      })
      .reduce((sum, p) => sum + p.final_amount, 0);

    return {
      totalDues,
      insuranceClaims,
      approvedClaims,
      pendingClaims,
      dueWithin30Days,
    };
  }, [allPayments]);

  // Filter and search payments for transaction history (Section 2)
  const filteredTransactions = useMemo(() => {
    let filtered = allPayments.filter(payment => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          payment.doctor_name.toLowerCase().includes(query) ||
          payment.appointment_id.toString().includes(query) ||
          (payment.service_name && payment.service_name.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Payment type filter
      if (filterPaymentType && payment.payment_method !== filterPaymentType) {
        return false;
      }

      // Payment status filter
      if (filterPaymentStatus) {
        if (filterPaymentStatus === "pending" && payment.payment_status !== "pending" && payment.payment_status !== null) {
          return false;
        } else if (filterPaymentStatus === "completed" && payment.payment_status !== "completed" && payment.payment_status !== "paid") {
          return false;
        } else if (filterPaymentStatus === "failed" && payment.payment_status !== "failed") {
          return false;
        }
      }

      // Date range filter
      if (filterDateFrom) {
        const paymentDate = new Date(payment.appointment_date);
        const fromDate = new Date(filterDateFrom);
        if (paymentDate < fromDate) return false;
      }

      if (filterDateTo) {
        const paymentDate = new Date(payment.appointment_date);
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (paymentDate > toDate) return false;
      }

      return true;
    });

    // Apply sorting
    return filtered.sort((a, b) => {
      let compareValue = 0;
      
      switch (sortField) {
        case "appointment_id":
          compareValue = a.appointment_id - b.appointment_id;
          break;
        case "appointment_date":
          compareValue = new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime();
          break;
        case "payment_updated_at":
          const aDate = a.payment_updated_at ? new Date(a.payment_updated_at).getTime() : 0;
          const bDate = b.payment_updated_at ? new Date(b.payment_updated_at).getTime() : 0;
          compareValue = aDate - bDate;
          break;
        case "doctor_name":
          compareValue = a.doctor_name.localeCompare(b.doctor_name);
          break;
        case "payment_method":
          compareValue = (a.payment_method || "").localeCompare(b.payment_method || "");
          break;
        case "final_amount":
          compareValue = a.final_amount - b.final_amount;
          break;
        case "payment_status":
          compareValue = (a.payment_status || "").localeCompare(b.payment_status || "");
          break;
        default:
          compareValue = new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime();
      }
      
      return sortDirection === "asc" ? compareValue : -compareValue;
    });
  }, [allPayments, searchQuery, filterPaymentType, filterPaymentStatus, filterDateFrom, filterDateTo, sortField, sortDirection]);

  const displayedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, visibleTransactions);
  }, [filteredTransactions, visibleTransactions]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new field with default descending
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) {
      return <span className="text-gray-400">⇅</span>;
    }
    return sortDirection === "asc" ? <span className="text-blue-600">↑</span> : <span className="text-blue-600">↓</span>;
  };

  const hasMoreTransactions = filteredTransactions.length > visibleTransactions;
  const activeFiltersCount = [filterPaymentType, filterPaymentStatus, filterDateFrom, filterDateTo].filter(Boolean).length;

  return (
    <main className="flex-1 p-6 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Finance Dashboard</h1>

        {isLoading ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <p className="text-gray-500">Loading payments...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchPendingPayments}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Summary Metrics */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="grid grid-cols-5 gap-6">
                <div className="text-center border-r border-gray-200 last:border-r-0">
                  <p className="text-sm text-gray-600 mb-2">Total Dues</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.totalDues)}</p>
                </div>
                <div className="text-center border-r border-gray-200 last:border-r-0">
                  <p className="text-sm text-gray-600 mb-2">Insurance claims</p>
                  <p className="text-2xl font-bold text-gray-900">{summaryMetrics.insuranceClaims}</p>
                </div>
                <div className="text-center border-r border-gray-200 last:border-r-0">
                  <p className="text-sm text-gray-600 mb-2">Approved claims</p>
                  <p className="text-2xl font-bold text-gray-900">{summaryMetrics.approvedClaims}</p>
                </div>
                <div className="text-center border-r border-gray-200 last:border-r-0">
                  <p className="text-sm text-gray-600 mb-2">Pending claims</p>
                  <p className="text-2xl font-bold text-gray-900">{summaryMetrics.pendingClaims}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Due within 30 days</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.dueWithin30Days)}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 flex items-center gap-2">
                Last updated a minute ago
                <button onClick={fetchPendingPayments} className="hover:text-gray-700">
                  <span className="text-base">↻</span>
                </button>
              </p>
            </div>

            {/* SECTION 1: Pending Payments */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Pending Payments</h2>
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {pendingPayments.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No pending payments at this time.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Transaction Id</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Paid to</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Amount Due</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Paid for</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {pendingPayments.map((payment) => (
                          <PendingPaymentRow
                            key={payment.appointment_id}
                            payment={payment}
                            onPayNow={() => {
                              setSelectedPayment(payment);
                              setShowPaymentDialog(true);
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 1B: Pending Approval */}
            {pendingApprovalPayments.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Pending Approval</h2>
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-yellow-800">
                        ⓘ These payments are awaiting doctor approval. You will be notified once the doctor reviews and approves your payment.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Transaction Id</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Paid to</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Payment Method</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Paid for</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {pendingApprovalPayments.map((payment) => (
                            <PendingApprovalRow
                              key={payment.appointment_id}
                              payment={payment}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: Transaction History */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h2>
                
                {/* Filters and Search */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                    <span className="text-gray-600">Filter</span>
                    <span className="w-5 h-5 bg-gray-300 rounded-full flex items-center justify-center text-xs font-medium">
                      {activeFiltersCount}
                    </span>
                  </div>
                  
                  {filterPaymentType && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <span className="text-gray-700">Payment type: {filterPaymentType}</span>
                      <button onClick={() => setFilterPaymentType("")} className="text-gray-500 hover:text-gray-700">×</button>
                    </div>
                  )}
                  
                  {filterPaymentStatus && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <span className="text-gray-700">Status: {filterPaymentStatus}</span>
                      <button onClick={() => setFilterPaymentStatus("")} className="text-gray-500 hover:text-gray-700">×</button>
                    </div>
                  )}
                  
                  {(filterDateFrom || filterDateTo) && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <span className="text-gray-700">
                        Date: {filterDateFrom ? formatDate(filterDateFrom) : "Start"} - {filterDateTo ? formatDate(filterDateTo) : "End"}
                      </span>
                      <button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }} className="text-gray-500 hover:text-gray-700">×</button>
                    </div>
                  )}
                  
                  <div className="flex-1 flex gap-2 justify-end">
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                    />
                    <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">
                      🔍
                    </button>
                  </div>
                </div>

                {/* Filter Options */}
                <div className="flex gap-3 mb-6">
                  <select
                    value={filterPaymentType}
                    onChange={(e) => setFilterPaymentType(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Payment Types</option>
                    <option value="online">Online</option>
                    <option value="cheque">Cheque</option>
                    <option value="insurance">Insurance</option>
                  </select>
                  
                  <select
                    value={filterPaymentStatus}
                    onChange={(e) => setFilterPaymentStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Payment Status</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Paid</option>
                    <option value="failed">Failed</option>
                  </select>
                  
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    placeholder="From Date"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    placeholder="To Date"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Table */}
                {displayedTransactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No transactions found matching your filters.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th 
                              onClick={() => handleSort("appointment_id")}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            >
                              <div className="flex items-center gap-1">
                                Transaction Id
                                <SortIcon field="appointment_id" />
                              </div>
                            </th>
                            <th 
                              onClick={() => handleSort("appointment_date")}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            >
                              <div className="flex items-center gap-1">
                                Date
                                <SortIcon field="appointment_date" />
                              </div>
                            </th>
                            <th 
                              onClick={() => handleSort("payment_updated_at")}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            >
                              <div className="flex items-center gap-1">
                                Transaction Date
                                <SortIcon field="payment_updated_at" />
                              </div>
                            </th>
                            <th 
                              onClick={() => handleSort("doctor_name")}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            >
                              <div className="flex items-center gap-1">
                                Paid to
                                <SortIcon field="doctor_name" />
                              </div>
                            </th>
                            <th 
                              onClick={() => handleSort("payment_method")}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            >
                              <div className="flex items-center gap-1">
                                Payment Type
                                <SortIcon field="payment_method" />
                              </div>
                            </th>
                            <th 
                              onClick={() => handleSort("final_amount")}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            >
                              <div className="flex items-center gap-1">
                                Total
                                <SortIcon field="final_amount" />
                              </div>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Amount Due</th>
                            <th 
                              onClick={() => handleSort("payment_status")}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            >
                              <div className="flex items-center gap-1">
                                Payment Status
                                <SortIcon field="payment_status" />
                              </div>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Paid for</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {displayedTransactions.map((payment) => (
                            <TransactionHistoryRow
                              key={payment.appointment_id}
                              payment={payment}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Load More Button */}
                    {hasMoreTransactions && (
                      <div className="mt-6 text-center">
                        <button
                          onClick={() => setVisibleTransactions(prev => prev + 10)}
                          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
                        >
                          Load More
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Payment Dialog with Order Details */}
        {showPaymentDialog && selectedPayment && (
          <PaymentDetailsDialog
            payment={selectedPayment}
            onClose={() => {
              setShowPaymentDialog(false);
              setSelectedPayment(null);
              setPaymentMethod(null);
            }}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    </main>
  );
}

// Component for Pending Payments Section (Section 1)
interface PendingPaymentRowProps {
  payment: PendingPaymentItem;
  onPayNow: () => void;
}

function PendingPaymentRow({ payment, onPayNow }: PendingPaymentRowProps) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">APT{payment.appointment_id}</td>
      <td className="px-4 py-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Appointment</div>
        <div className="text-sm text-gray-900 font-medium">{formatDate(payment.appointment_date)}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {payment.doctor_photo_url ? (
            <Image
              src={payment.doctor_photo_url}
              alt={payment.doctor_name}
              width={24}
              height={24}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">
              👤
            </div>
          )}
          <span className="text-sm text-gray-900">{payment.doctor_name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(payment.final_amount)}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(payment.final_amount)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">
        Appointment: {payment.appointment_id}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onPayNow}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition"
        >
          PAY NOW
        </button>
      </td>
    </tr>
  );
}

// Component for Pending Approval Section (Section 1B)
interface PendingApprovalRowProps {
  payment: PendingPaymentItem;
}

function PendingApprovalRow({ payment }: PendingApprovalRowProps) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">APT{payment.appointment_id}</td>
      <td className="px-4 py-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Appointment</div>
        <div className="text-sm text-gray-900 font-medium">{formatDate(payment.appointment_date)}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {payment.doctor_photo_url ? (
            <Image
              src={payment.doctor_photo_url}
              alt={payment.doctor_name}
              width={24}
              height={24}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">
              👤
            </div>
          )}
          <span className="text-sm text-gray-900">{payment.doctor_name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full uppercase">
          {payment.payment_method}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(payment.final_amount)}</td>
      <td className="px-4 py-3">
        <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
          Awaiting Approval
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        Appointment: {payment.appointment_id}
      </td>
    </tr>
  );
}

// Component for Transaction History Section (Section 2)
interface TransactionHistoryRowProps {
  payment: PendingPaymentItem;
}

function TransactionHistoryRow({ payment }: TransactionHistoryRowProps) {
  const getPaymentStatusBadge = (status: string | null | undefined) => {
    if (!status || status === "pending") {
      return <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
    }
    if (status === "completed" || status === "paid") {
      return <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Paid</span>;
    }
    if (status === "overdue") {
      return <span className="px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Overdue</span>;
    }
    if (status === "draft") {
      return <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Draft</span>;
    }
    if (status === "failed") {
      return <span className="px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Failed</span>;
    }
    return <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{status}</span>;
  };

  const isPaid = payment.payment_status === "completed" || payment.payment_status === "paid";

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">APT{payment.appointment_id}</td>
      <td className="px-4 py-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Appointment</div>
        <div className="text-sm text-gray-900 font-medium">{formatDate(payment.appointment_date)}</div>
      </td>
      <td className="px-4 py-3">
        {payment.payment_updated_at ? (
          <div className="text-sm text-gray-900">{formatDateTime(payment.payment_updated_at)}</div>
        ) : (
          <div className="text-sm text-gray-400">-</div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {payment.doctor_photo_url ? (
            <Image
              src={payment.doctor_photo_url}
              alt={payment.doctor_name}
              width={24}
              height={24}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">
              👤
            </div>
          )}
          <span className="text-sm text-gray-900">{payment.doctor_name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 uppercase">{payment.payment_method || "-"}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(payment.final_amount)}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">
        {isPaid ? formatCurrency(0) : formatCurrency(payment.final_amount)}
      </td>
      <td className="px-4 py-3">{getPaymentStatusBadge(payment.payment_status)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">
        Appointment: {payment.appointment_id}
      </td>
    </tr>
  );
}

// Inline Payment Sections
interface PaymentSectionProps {
  payment: PendingPaymentItem;
  totalAmount?: number;
  setError: (error: string | null) => void;
  setIsSubmitting: (submitting: boolean) => void;
  onSuccess: () => void;
  formRef: React.RefObject<HTMLFormElement>;
}

function OnlinePaymentSection({ payment, setError, setIsSubmitting, onSuccess, formRef }: PaymentSectionProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedPaymentCard[]>([]);
  const [useSavedCard, setUseSavedCard] = useState<number | null>(null);

  useEffect(() => {
    patientFinanceAPI.listSavedCards().then(setSavedCards).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let cardLastFour = "";
      let cardBrand = "";
      let expiryMonthNum = 0;
      let expiryYearNum = 0;
      let cardholderNameValue = "";

      if (useSavedCard) {
        const savedCard = savedCards.find((c) => c.id === useSavedCard);
        if (!savedCard) {
          throw new Error("Selected card not found");
        }
        cardLastFour = savedCard.card_last_four;
        cardBrand = savedCard.card_brand;
        expiryMonthNum = savedCard.expiry_month;
        expiryYearNum = savedCard.expiry_year;
        cardholderNameValue = savedCard.cardholder_name || "";
      } else {
        const cleaned = cardNumber.replace(/\s/g, "");
        if (cleaned.length < 4) {
          throw new Error("Invalid card number");
        }
        cardLastFour = cleaned.slice(-4);
        cardBrand = cleaned.startsWith("4") ? "Visa" : "Mastercard";
        expiryMonthNum = parseInt(expiryMonth);
        expiryYearNum = parseInt(expiryYear);
        cardholderNameValue = cardholderName;
      }

      await patientFinanceAPI.submitOnlinePayment({
        appointment_id: payment.appointment_id,
        card_last_four: cardLastFour,
        card_brand: cardBrand,
        expiry_month: expiryMonthNum,
        expiry_year: expiryYearNum,
        cardholder_name: cardholderNameValue,
        save_card: saveCard && !useSavedCard,
      });

      onSuccess();
    } catch (err: any) {
      setError(err.detail || err.message || "Failed to process payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="border-2 border-blue-200 rounded-xl p-5 bg-blue-50/30 space-y-4">
      <h4 className="font-semibold text-gray-900">Card Payment Details</h4>
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <p className="text-xs text-green-800">
          ✓ Instant confirmation! Your payment will be processed immediately and your appointment will be confirmed right away.
        </p>
      </div>
      
      {savedCards.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Use Saved Card</label>
          <select
            value={useSavedCard || ""}
            onChange={(e) => setUseSavedCard(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Enter new card</option>
            {savedCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.card_brand} •••• {card.card_last_four} (Exp: {card.expiry_month}/{card.expiry_year})
              </option>
            ))}
          </select>
        </div>
      )}

      {!useSavedCard && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Card Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => {
                const value = e.target.value.replace(/\s/g, "");
                const formatted = value.match(/.{1,4}/g)?.join(" ") || value;
                setCardNumber(formatted.slice(0, 19));
              }}
              placeholder="1234 5678 9012 3456"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cardholder Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value)}
              placeholder="John Doe"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={expiryMonth}
                onChange={(e) => setExpiryMonth(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">MM</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month.toString().padStart(2, "0")}>
                    {month.toString().padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={expiryYear}
                onChange={(e) => setExpiryYear(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">YYYY</option>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
              <input
                type="text"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={saveCard}
              onChange={(e) => setSaveCard(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Save card for future use
          </label>
        </>
      )}
    </form>
  );
}

function ChequePaymentSection({ payment, setError, setIsSubmitting, onSuccess, formRef }: PaymentSectionProps) {
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);

  const validateFileType = (file: File): boolean => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return allowedTypes.includes(file.type.toLowerCase());
  };

  const handleFileChange = (file: File | null, setter: (file: File | null) => void, label: string) => {
    if (file && !validateFileType(file)) {
      setError(`Invalid file type for ${label}. Please upload JPG, JPEG, PNG, or WEBP images only.`);
      setter(null);
      return;
    }
    setError(null);
    setter(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!frontImage || !backImage) {
      setError("Please upload both front and back images of the cheque");
      return;
    }

    // Validate file types before submission
    if (!validateFileType(frontImage)) {
      setError("Invalid file type for front image. Please upload JPG, JPEG, PNG, or WEBP images only.");
      return;
    }

    if (!validateFileType(backImage)) {
      setError("Invalid file type for back image. Please upload JPG, JPEG, PNG, or WEBP images only.");
      return;
    }

    setIsSubmitting(true);
    try {
      await patientFinanceAPI.submitChequePayment(payment.appointment_id, [frontImage, backImage]);
      onSuccess();
    } catch (err: any) {
      setError(err.detail || err.message || "Failed to submit cheque payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="border-2 border-green-200 rounded-xl p-5 bg-green-50/30 space-y-4">
      <h4 className="font-semibold text-gray-900">Upload Cheque Images</h4>
      <p className="text-sm text-gray-600">Please upload self-attested photos of the cheque (front and back)</p>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <p className="text-xs text-yellow-800">
          ⓘ Your cheque images will be sent to the doctor for approval. Payment will remain pending until the doctor approves it. Once approved, your appointment will be confirmed.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cheque Front <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null, setFrontImage, "Cheque Front")}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
          />
          {frontImage && <p className="text-xs text-green-600 mt-1">✓ {frontImage.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cheque Back <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null, setBackImage, "Cheque Back")}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
          />
          {backImage && <p className="text-xs text-green-600 mt-1">✓ {backImage.name}</p>}
        </div>
      </div>
      <p className="text-xs text-gray-500">Accepted formats: JPG, JPEG, PNG, WEBP only</p>
    </form>
  );
}

function InsurancePaymentSection({ payment, setError, setIsSubmitting, onSuccess, formRef }: PaymentSectionProps) {
  const [insurancePolicies, setInsurancePolicies] = useState<InsurancePolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    insuranceAPI
      .listPolicies()
      .then((policies) => {
        const active = policies.filter((p) => {
          if (!p.coverage_end) return true;
          return new Date(p.coverage_end) >= new Date();
        });
        setInsurancePolicies(active);
        if (active.length > 0) {
          setSelectedPolicyId(active[0].id);
        }
      })
      .catch(() => {
        setError("Failed to load insurance policies");
      })
      .finally(() => setIsLoading(false));
  }, [setError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPolicyId) {
      setError("Please select an insurance policy");
      return;
    }

    setIsSubmitting(true);
    try {
      await patientFinanceAPI.submitInsurancePayment(
        payment.appointment_id,
        selectedPolicyId
      );
      onSuccess();
    } catch (err: any) {
      setError(err.detail || err.message || "Failed to submit insurance payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPolicy = useMemo(() => {
    return insurancePolicies.find(p => p.id === selectedPolicyId);
  }, [insurancePolicies, selectedPolicyId]);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="border-2 border-purple-200 rounded-xl p-5 bg-purple-50/30 space-y-4">
      <h4 className="font-semibold text-gray-900">Insurance Claim Details</h4>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <p className="text-xs text-yellow-800">
          ⓘ Your insurance policy details and documents will be sent to the doctor for approval. Payment will remain pending until the doctor approves the insurance claim. Once approved, your appointment will be confirmed.
        </p>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading insurance policies...</p>
      ) : insurancePolicies.length === 0 ? (
        <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
          <p className="text-sm text-yellow-800 mb-3">
            No active insurance policies found. Please add an insurance policy first.
          </p>
          <Link
            href="/dashboard/patient/insurance"
            className="inline-block px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
          >
            Add Insurance Policy
          </Link>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Insurance Policy <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPolicyId}
              onChange={(e) => setSelectedPolicyId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
            >
              {insurancePolicies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.insurer_name} - {policy.policy_number}
                </option>
              ))}
            </select>
          </div>

          {selectedPolicy && (
            <div className="border border-purple-200 bg-purple-50/50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-700 uppercase">Policy Information</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Provider</p>
                  <p className="font-medium text-gray-900">{selectedPolicy.insurer_name}</p>
                </div>
                <div>
                  <p className="text-gray-600">Policy Number</p>
                  <p className="font-medium text-gray-900">{selectedPolicy.policy_number}</p>
                </div>
                {selectedPolicy.insurance_number && (
                  <div>
                    <p className="text-gray-600">Insurance Number</p>
                    <p className="font-medium text-gray-900">{selectedPolicy.insurance_number}</p>
                  </div>
                )}
                {selectedPolicy.cover_amount && (
                  <div>
                    <p className="text-gray-600">Cover Amount</p>
                    <p className="font-medium text-gray-900">{formatCurrency(selectedPolicy.cover_amount)}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                By using insurance you consent to send policy document to the doctor for approval.
              </p>
            </div>
          )}
        </>
      )}
    </form>
  );
}

interface PaymentDetailsDialogProps {
  payment: PendingPaymentItem;
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentDetailsDialog({ payment, onClose, onSuccess }: PaymentDetailsDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<"online" | "cheque" | "insurance" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Calculate fees
  const doctorFees = payment.final_amount;
  const platformFeePercent = 9;
  const platformFee = (doctorFees * platformFeePercent) / 100;
  const stateTaxPercent = 8.5;
  const stateTax = (doctorFees * stateTaxPercent) / 100;
  const totalAmount = doctorFees + platformFee + stateTax;

  const generateTransactionId = () => {
    return `INV${payment.appointment_id}${Date.now().toString().slice(-4)}`;
  };

  const handlePayNow = () => {
    if (formRef.current) {
      formRef.current.requestSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-md p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-bold text-gray-900">Order Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Order Details */}
          <div className="border-2 border-gray-200 rounded-xl p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Transaction ID</p>
                <p className="text-base font-semibold text-gray-900">{generateTransactionId()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Paid to</p>
                <p className="text-base font-semibold text-gray-900">{payment.doctor_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Appointment ID</p>
                <p className="text-base font-semibold text-gray-900">Avpt{payment.appointment_id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Paid for</p>
                <p className="text-base font-semibold text-gray-900">Appointment: {payment.service_name || "Consultation"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Appointment date</p>
                <p className="text-base font-semibold text-gray-900">{formatDateTime(payment.appointment_date)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Amount</p>
                <p className="text-base font-semibold text-gray-900">{formatCurrency(doctorFees)}</p>
              </div>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="border-2 border-gray-200 rounded-xl p-5">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Breakdown</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Doctor's Fees</span>
                <span className="font-semibold text-gray-900">{formatCurrency(doctorFees)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Platform fees</span>
                <span className="text-gray-700">{platformFeePercent}% → {formatCurrency(platformFee)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">State tax</span>
                <span className="text-gray-700">{stateTaxPercent}% → {formatCurrency(stateTax)}</span>
              </div>
              <div className="border-t border-gray-300 pt-3 flex justify-between items-center text-sm">
                <span className="text-gray-600">Total</span>
                <span className="text-gray-700">
                  {formatCurrency(doctorFees)} + {formatCurrency(platformFee)} + {formatCurrency(stateTax)} →
                </span>
              </div>
              <div className="flex justify-end">
                <span className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Select a payment Method</h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setSelectedMethod("online")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                  selectedMethod === "online"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-blue-300"
                }`}
              >
                <span className="text-3xl">💳</span>
                <span className="font-semibold text-sm">CARD</span>
              </button>
              
              <button
                onClick={() => setSelectedMethod("cheque")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                  selectedMethod === "cheque"
                    ? "border-green-500 bg-green-50"
                    : "border-gray-300 hover:border-green-300"
                }`}
              >
                <span className="text-3xl">📄</span>
                <span className="font-semibold text-sm">CHEQUE</span>
              </button>
              
              <button
                onClick={() => setSelectedMethod("insurance")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                  selectedMethod === "insurance"
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-300 hover:border-purple-300"
                }`}
              >
                <span className="text-3xl">🏥</span>
                <span className="font-semibold text-sm">INSURANCE</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Payment Method Forms */}
          {selectedMethod === "online" && (
            <OnlinePaymentSection payment={payment} totalAmount={totalAmount} setError={setError} setIsSubmitting={setIsSubmitting} onSuccess={onSuccess} formRef={formRef} />
          )}

          {selectedMethod === "cheque" && (
            <ChequePaymentSection payment={payment} setError={setError} setIsSubmitting={setIsSubmitting} onSuccess={onSuccess} formRef={formRef} />
          )}

          {selectedMethod === "insurance" && (
            <InsurancePaymentSection payment={payment} setError={setError} setIsSubmitting={setIsSubmitting} onSuccess={onSuccess} formRef={formRef} />
          )}
        </div>

        {/* Footer with Total and Pay Now */}
        {selectedMethod && (
          <div className="p-6 border-t border-gray-200 flex items-center justify-between sticky bottom-0 bg-white">
            <div className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</div>
            <button
              onClick={handlePayNow}
              disabled={isSubmitting}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition text-lg"
            >
              {isSubmitting ? "Processing..." : "Pay Now"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
