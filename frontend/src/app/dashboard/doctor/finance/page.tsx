"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import {
  doctorFinanceAPI,
  DoctorService,
  PendingPaymentItem,
  Payment,
} from "@/services/api";

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

type TimeFilter = "weekly" | "monthly" | "yearly";

interface WidgetMetrics {
  totalReceived: number;
  totalPendingApproval: number;
  totalUnpaid: number;
  newCustomers: number;
}

export default function FinancePage() {
  const { user: _user } = useAuth();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("monthly");
  const [widgetMetrics, setWidgetMetrics] = useState<WidgetMetrics>({
    totalReceived: 0,
    totalPendingApproval: 0,
    totalUnpaid: 0,
    newCustomers: 0,
  });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);

  const fetchMetrics = async () => {
    try {
      setIsLoadingMetrics(true);
      const data = await doctorFinanceAPI.getMetrics(timeFilter);
      setWidgetMetrics({
        totalReceived: data.total_received,
        totalPendingApproval: data.total_pending_approval,
        totalUnpaid: data.total_unpaid,
        newCustomers: data.new_customers,
      });
    } catch (err: any) {
      console.error("Failed to load metrics", err);
      // Set to 0 on error
      setWidgetMetrics({
        totalReceived: 0,
        totalPendingApproval: 0,
        totalUnpaid: 0,
        newCustomers: 0,
      });
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [timeFilter]);

  return (
    <main className="flex-1 p-4 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Finance Dashboard</h1>

        {/* Widgets Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Widget
            title="Total Payment Received"
            value={formatCurrency(widgetMetrics.totalReceived)}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            isLoading={isLoadingMetrics}
            color="green"
          />
          <Widget
            title="Total Amount Pending for Approval"
            value={formatCurrency(widgetMetrics.totalPendingApproval)}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            isLoading={isLoadingMetrics}
            color="yellow"
          />
          <Widget
            title="Total Unpaid Amount"
            value={formatCurrency(widgetMetrics.totalUnpaid)}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            isLoading={isLoadingMetrics}
            color="gray"
          />
          <Widget
            title="No. of New Customers"
            value={widgetMetrics.newCustomers.toString()}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            isLoading={isLoadingMetrics}
            color="blue"
          />
        </div>

        {/* Payment Approvals Section */}
        <PaymentApprovalsSection />

        {/* Pending Payments Section */}
        <PendingPaymentsSection />

        {/* Transaction History Section */}
        <TransactionHistorySection />

        {/* Fees and Services Section */}
        <FeesAndServicesSection />
      </div>
    </main>
  );
}

// ==================== Widget Component ====================

interface WidgetProps {
  title: string;
  value: string;
  timeFilter: TimeFilter;
  onTimeFilterChange: (filter: TimeFilter) => void;
  isLoading: boolean;
  color: "green" | "yellow" | "red" | "blue" | "gray";
}

function Widget({ title, value, timeFilter, onTimeFilterChange, isLoading, color }: WidgetProps) {
  const colorClasses = {
    green: "text-green-600 bg-green-50",
    yellow: "text-yellow-600 bg-yellow-50",
    red: "text-red-600 bg-red-50",
    blue: "text-blue-600 bg-blue-50",
    gray: "text-gray-600 bg-gray-50",
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-medium text-gray-600 mb-3">{title}</h3>
      {isLoading ? (
        <div className="h-10 bg-gray-100 animate-pulse rounded mb-4"></div>
      ) : (
        <p className={`text-3xl font-bold mb-4 ${colorClasses[color]}`}>{value}</p>
      )}
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => onTimeFilterChange("weekly")}
          className={`text-sm transition ${
            timeFilter === "weekly"
              ? "font-bold text-black"
              : "font-normal text-gray-600 hover:text-gray-900"
          }`}
        >
          Weekly
        </button>
        <button
          onClick={() => onTimeFilterChange("monthly")}
          className={`text-sm transition ${
            timeFilter === "monthly"
              ? "font-bold text-black"
              : "font-normal text-gray-600 hover:text-gray-900"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => onTimeFilterChange("yearly")}
          className={`text-sm transition ${
            timeFilter === "yearly"
              ? "font-bold text-black"
              : "font-normal text-gray-600 hover:text-gray-900"
          }`}
        >
          Yearly
        </button>
      </div>
    </div>
  );
}

// ==================== Section 1: Payment Approvals ====================

function PaymentApprovalsSection() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingFiles, setViewingFiles] = useState<number | null>(null);
  const [files, setFiles] = useState<any[]>([]);

  const fetchPayments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await doctorFinanceAPI.getPaymentsPendingApproval();
      setPayments(data);
    } catch (err: any) {
      setError(err.detail || "Failed to load payments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleViewFiles = async (paymentId: number) => {
    try {
      const data = await doctorFinanceAPI.getPaymentFiles(paymentId);
      setFiles(data.files);
      setViewingFiles(paymentId);
    } catch (err: any) {
      alert(err.detail || "Failed to load files");
    }
  };

  const handleApprove = async (paymentId: number) => {
    if (!confirm("Are you sure you want to approve this payment?")) return;
    try {
      await doctorFinanceAPI.approvePayment(paymentId);
      fetchPayments();
      setViewingFiles(null);
      setFiles([]);
    } catch (err: any) {
      alert(err.detail || "Failed to approve payment");
    }
  };

  const handleReject = async (paymentId: number) => {
    if (!confirm("Are you sure you want to reject this payment?")) return;
    // Optimistic UI: remove from list and clear viewer; restore if failed
    setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    setViewingFiles(null);
    setFiles([]);
    try {
      await doctorFinanceAPI.rejectPayment(paymentId);
      fetchPayments();
    } catch (err: any) {
      const msg = (err && (err.detail || err.message)) || "Failed to reject payment";
      // If backend already rejected or payment is no longer pending, just refresh silently
      const lower = msg.toLowerCase();
      const alreadyHandled =
        lower.includes("not pending") ||
        lower.includes("not found") ||
        lower.includes("does not belong");
      if (alreadyHandled) {
        fetchPayments();
        return;
      }
      // Revert optimistic update on hard failure
      setPayments((prev) => {
        // trigger reload on next fetch
        fetchPayments();
        return prev;
      });
      alert(msg);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Payment Approvals</h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Review and approve cheque or insurance payments submitted by patients.
          </p>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading payments...</div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchPayments}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No payments pending approval at this time.
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id}>
                  <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full uppercase">
                            {payment.payment_method}
                          </span>
                          <span className="text-sm text-gray-600">
                            Payment ID: #{payment.id}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Appointment ID:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {payment.appointment_id}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Amount:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {formatCurrency(payment.final_amount)}
                            </span>
                          </div>
                          {payment.transaction_id && (
                            <div className="col-span-2">
                              <span className="text-gray-600">Transaction ID:</span>
                              <span className="ml-2 font-mono text-xs text-gray-700">
                                {payment.transaction_id}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {(payment.payment_method === "cheque" ||
                          payment.payment_method === "insurance") && (
                          <button
                            onClick={() => handleViewFiles(payment.id)}
                            className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium"
                          >
                            View Documents
                          </button>
                        )}
                        <button
                          onClick={() => handleApprove(payment.id)}
                          className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(payment.id)}
                          className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* File Viewer */}
                  {viewingFiles === payment.id && (
                    <div className="mt-3 ml-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-900">
                          Payment Documents
                        </h4>
                        <button
                          onClick={() => {
                            setViewingFiles(null);
                            setFiles([]);
                          }}
                          className="text-gray-400 hover:text-gray-600 text-xl"
                        >
                          ×
                        </button>
                      </div>
                      {files.length === 0 ? (
                        <div className="text-sm text-gray-600">No documents available.</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {files.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {file.file_name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {(file.file_size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                              <a
                                href={file.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-3 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                              >
                                View
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Section 2: Pending Payments ====================

function PendingPaymentsSection() {
  const [pendingPayments, setPendingPayments] = useState<PendingPaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<number | null>(null);
  const [discountValue, setDiscountValue] = useState("");

  const fetchPendingPayments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await doctorFinanceAPI.getPendingPayments();
      // Filter to show only truly pending payments (payment_status === 'pending')
      const trulyPending = data.filter(
        (p) => p.payment_status === "pending" || p.payment_status === null
      );
      setPendingPayments(trulyPending);
    } catch (err: any) {
      setError(err.detail || "Failed to load pending payments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  const handleUpdateDiscount = async (paymentId: number, baseAmount: number) => {
    const discount = parseFloat(discountValue);
    if (isNaN(discount) || discount < 0 || discount > baseAmount) {
      alert("Invalid discount amount");
      return;
    }

    try {
      await doctorFinanceAPI.updatePaymentDiscount(paymentId, {
        discount_amount: discount,
      });
      setEditingDiscount(null);
      setDiscountValue("");
      fetchPendingPayments();
    } catch (err: any) {
      alert(err.detail || "Failed to update discount");
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Pending Payments</h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Set discounts for pending payments before patients make payment.
          </p>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading pending payments...</div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchPendingPayments}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No pending payments at this time.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Appointment ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Patient Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Service
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Base Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Discount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Final Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pendingPayments.map((payment) => (
                    <tr key={payment.appointment_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        APT{payment.appointment_id}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {payment.patient_name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-500 uppercase tracking-wide">
                          Appointment
                        </div>
                        <div className="text-sm text-gray-900 font-medium">
                          {formatDate(payment.appointment_date)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {payment.service_name || "Consultation"}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {formatCurrency(payment.base_amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {editingDiscount === payment.payment_id ? (
                          <input
                            type="number"
                            value={discountValue}
                            onChange={(e) => setDiscountValue(e.target.value)}
                            min="0"
                            max={payment.base_amount}
                            step="0.01"
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            placeholder="0.00"
                          />
                        ) : (
                          formatCurrency(payment.discount_amount)
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">
                        {formatCurrency(payment.final_amount)}
                      </td>
                      <td className="px-4 py-3">
                        {editingDiscount === payment.payment_id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() =>
                                payment.payment_id &&
                                handleUpdateDiscount(payment.payment_id, payment.base_amount)
                              }
                              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingDiscount(null);
                                setDiscountValue("");
                              }}
                              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          payment.payment_id && (
                            <button
                              onClick={() => {
                                setEditingDiscount(payment.payment_id!);
                                setDiscountValue(payment.discount_amount.toString());
                              }}
                              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
                            >
                              {payment.discount_amount > 0 ? "Edit" : "Add Discount"}
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Section 3: Transaction History ====================

function TransactionHistorySection() {
  const [transactions, setTransactions] = useState<PendingPaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleTransactions, setVisibleTransactions] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("payment_updated_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await doctorFinanceAPI.getPaymentHistory();
      setTransactions(data);
    } catch (err: any) {
      setError(err.detail || "Failed to load transaction history. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="text-gray-400">⇅</span>;
    return <span>{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.appointment_id.toString().includes(query) ||
          t.patient_name.toLowerCase().includes(query) ||
          (t.payment_method && t.payment_method.toLowerCase().includes(query)) ||
          (t.service_name && t.service_name.toLowerCase().includes(query))
      );
    }

    // Apply payment status filter
    if (filterPaymentStatus !== "all") {
      filtered = filtered.filter((t) => t.payment_status === filterPaymentStatus);
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      let compareValue = 0;

      switch (sortField) {
        case "appointment_id":
          compareValue = a.appointment_id - b.appointment_id;
          break;
        case "appointment_date":
          compareValue =
            new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime();
          break;
        case "payment_updated_at":
          const aDate = a.payment_updated_at
            ? new Date(a.payment_updated_at).getTime()
            : 0;
          const bDate = b.payment_updated_at
            ? new Date(b.payment_updated_at).getTime()
            : 0;
          compareValue = aDate - bDate;
          break;
        case "patient_name":
          compareValue = a.patient_name.localeCompare(b.patient_name);
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
          compareValue =
            new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime();
      }

      return sortDirection === "asc" ? compareValue : -compareValue;
    });
  }, [transactions, searchQuery, filterPaymentStatus, sortField, sortDirection]);

  const displayedTransactions = filteredTransactions.slice(0, visibleTransactions);
  const hasMoreTransactions = visibleTransactions < filteredTransactions.length;

  const getPaymentStatusBadge = (status: string | null | undefined) => {
    if (!status || status === "pending") {
      return (
        <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
          Pending
        </span>
      );
    }
    if (status === "completed" || status === "paid") {
      return (
        <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
          Received
        </span>
      );
    }
    if (status === "overdue") {
      return (
        <span className="px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
          Overdue
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span className="px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
          Failed
        </span>
      );
    }
    return (
      <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
        {status}
      </span>
    );
  };

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Transaction History</h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading transaction history...</div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchTransactions}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Search and Filter Bar */}
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <div className="flex gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search by appointment ID, patient name, payment type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <select
                    value={filterPaymentStatus}
                    onChange={(e) => setFilterPaymentStatus(e.target.value)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="paid">Received</option>
                    <option value="overdue">Overdue</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No transactions found matching your criteria.
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
                          onClick={() => handleSort("patient_name")}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                        >
                          <div className="flex items-center gap-1">
                            Patient
                            <SortIcon field="patient_name" />
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
                            Amount
                            <SortIcon field="final_amount" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("payment_status")}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                        >
                          <div className="flex items-center gap-1">
                            Status
                            <SortIcon field="payment_status" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Received for
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {displayedTransactions.map((transaction) => (
                        <tr key={transaction.appointment_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">
                            APT{transaction.appointment_id}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">
                              Appointment
                            </div>
                            <div className="text-sm text-gray-900 font-medium">
                              {formatDate(transaction.appointment_date)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {transaction.payment_updated_at ? (
                              <div className="text-sm text-gray-900">
                                {formatDateTime(transaction.payment_updated_at)}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400">-</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.patient_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 uppercase">
                            {transaction.payment_method || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {formatCurrency(transaction.final_amount)}
                          </td>
                          <td className="px-4 py-3">
                            {getPaymentStatusBadge(transaction.payment_status)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            Appointment: {transaction.appointment_id}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Load More Button */}
                {hasMoreTransactions && (
                  <div className="p-6 text-center border-t border-gray-200">
                    <button
                      onClick={() => setVisibleTransactions((prev) => prev + 10)}
                      className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
                    >
                      Load More
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ==================== Section 4: Fees and Services ====================

function FeesAndServicesSection() {
  const [services, setServices] = useState<DoctorService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState<DoctorService | null>(null);

  const fetchServices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await doctorFinanceAPI.listServices();
      setServices(data);
    } catch (err: any) {
      setError(err.detail || "Failed to load services. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const handleDelete = async (serviceId: number) => {
    if (!confirm("Are you sure you want to delete this service?")) return;
    try {
      await doctorFinanceAPI.deleteService(serviceId);
      fetchServices();
    } catch (err: any) {
      alert(err.detail || "Failed to delete service");
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Fees and Services</h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              Manage your services and their pricing. Consultation fee defaults to $100 if not set.
            </p>
            <button
              onClick={() => {
                setEditingService(null);
                setShowAddForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              + Add Service
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading services...</div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchServices}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No services added yet. Add your first service to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 text-lg">
                        {service.service_name}
                      </h3>
                      {service.description && (
                        <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-blue-600 ml-4">
                      {formatCurrency(service.price)}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setEditingService(service);
                        setShowAddForm(true);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(service.id)}
                      className="flex-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddForm && (
        <ServiceFormDialog
          service={editingService}
          onClose={() => {
            setShowAddForm(false);
            setEditingService(null);
          }}
          onSuccess={() => {
            setShowAddForm(false);
            setEditingService(null);
            fetchServices();
          }}
        />
      )}
    </div>
  );
}

// ==================== Service Form Dialog ====================

interface ServiceFormDialogProps {
  service: DoctorService | null;
  onClose: () => void;
  onSuccess: () => void;
}

function ServiceFormDialog({ service, onClose, onSuccess }: ServiceFormDialogProps) {
  const [serviceName, setServiceName] = useState(service?.service_name || "");
  const [description, setDescription] = useState(service?.description || "");
  const [price, setPrice] = useState(service?.price.toString() || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (service) {
        await doctorFinanceAPI.updateService(service.id, {
          service_name: serviceName,
          description: description || undefined,
          price: parseFloat(price),
        });
      } else {
        await doctorFinanceAPI.createService({
          service_name: serviceName,
          description: description || undefined,
          price: parseFloat(price),
        });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.detail || "Failed to save service. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/20 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {service ? "Edit Service" : "Add New Service"}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="e.g., Offline Consultation"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Optional description of the service"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price ($) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="0.00"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Saving..." : service ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
