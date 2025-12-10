"use client";

import { useEffect, useState } from "react";
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
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function FinancePage() {
  const { user: _user } = useAuth();
  const [activeSection, setActiveSection] = useState<"services" | "discounts" | "approvals">(
    "services"
  );

  return (
    <main className="flex-1 p-4 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Finance Dashboard</h1>

        {/* Section Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveSection("services")}
              className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                activeSection === "services"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Services Management
            </button>
            <button
              onClick={() => setActiveSection("discounts")}
              className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                activeSection === "discounts"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Pending Payments & Discounts
            </button>
            <button
              onClick={() => setActiveSection("approvals")}
              className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                activeSection === "approvals"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Payment Approvals
            </button>
          </div>
        </div>

        {/* Section Content */}
        {activeSection === "services" && <ServicesSection />}
        {activeSection === "discounts" && <DiscountsSection />}
        {activeSection === "approvals" && <ApprovalsSection />}
      </div>
    </main>
  );
}

// ==================== Section 1: Services Management ====================

function ServicesSection() {
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
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Services & Fees</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage your services and their pricing. Consultation fee defaults to $100 if not set.
            </p>
          </div>
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
          <p className="text-gray-500 text-center py-8">Loading services...</p>
        ) : error ? (
          <div className="text-red-600 text-center py-8">
            <p>{error}</p>
            <button
              onClick={fetchServices}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No services added yet. Add your first service to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{service.service_name}</h3>
                  {service.description && (
                    <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                  )}
                  <p className="text-lg font-bold text-blue-600 mt-2">
                    {formatCurrency(service.price)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingService(service);
                      setShowAddForm(true);
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(service.id)}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddForm && (
        <ServiceForm
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

interface ServiceFormProps {
  service: DoctorService | null;
  onClose: () => void;
  onSuccess: () => void;
}

function ServiceForm({ service, onClose, onSuccess }: ServiceFormProps) {
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
    <div className="bg-white rounded-lg shadow p-6">
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
  );
}

// ==================== Section 2: Pending Payments & Discounts ====================

function DiscountsSection() {
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
      setPendingPayments(data);
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Pending Payments</h2>
        <p className="text-sm text-gray-500 mt-1">
          Set discounts for pending payments before patients make payment.
        </p>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-center py-8">Loading pending payments...</p>
      ) : error ? (
        <div className="text-red-600 text-center py-8">
          <p>{error}</p>
          <button
            onClick={fetchPendingPayments}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : pendingPayments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No pending payments at this time.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingPayments.map((payment) => (
            <div
              key={payment.appointment_id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{payment.patient_name}</h3>
                  <p className="text-sm text-gray-600">{payment.service_name || "Consultation"}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatDate(payment.appointment_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(payment.final_amount)}
                  </p>
                  {payment.discount_amount > 0 && (
                    <p className="text-sm text-gray-500 line-through">
                      {formatCurrency(payment.base_amount)}
                    </p>
                  )}
                </div>
              </div>

              {editingDiscount === (payment.payment_id || 0) ? (
                <div className="flex items-center gap-3 pt-3 border-t border-gray-200">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Discount Amount ($)
                    </label>
                    <input
                      type="number"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      min="0"
                      max={payment.base_amount}
                      step="0.01"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => {
                        setEditingDiscount(null);
                        setDiscountValue("");
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    {payment.payment_id && (
                      <button
                        onClick={() =>
                          handleUpdateDiscount(payment.payment_id!, payment.base_amount)
                        }
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <div>
                    <p className="text-sm text-gray-600">
                      Base: {formatCurrency(payment.base_amount)} | Discount:{" "}
                      {formatCurrency(payment.discount_amount)}
                    </p>
                  </div>
                  {payment.payment_id && (
                    <button
                      onClick={() => {
                        setEditingDiscount(payment.payment_id!);
                        setDiscountValue(payment.discount_amount.toString());
                      }}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      {payment.discount_amount > 0 ? "Update Discount" : "Add Discount"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Section 3: Payment Approvals ====================

function ApprovalsSection() {
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Payments Pending Approval</h2>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve cheque or insurance payments.
          </p>
        </div>

        {isLoading ? (
          <p className="text-gray-500 text-center py-8">Loading payments...</p>
        ) : error ? (
          <div className="text-red-600 text-center py-8">
            <p>{error}</p>
            <button
              onClick={fetchPayments}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No payments pending approval at this time.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Payment #{payment.id} - {payment.payment_method.toUpperCase()}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Appointment ID: {payment.appointment_id}
                    </p>
                    <p className="text-sm text-gray-600">
                      Amount: {formatCurrency(payment.final_amount)}
                    </p>
                    {payment.transaction_id && (
                      <p className="text-xs text-gray-500 mt-1">
                        Transaction ID: {payment.transaction_id}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {(payment.payment_method === "cheque" || payment.payment_method === "insurance") && (
                      <button
                        onClick={() => handleViewFiles(payment.id)}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        View Files
                      </button>
                    )}
                    <button
                      onClick={() => handleApprove(payment.id)}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingFiles !== null && files.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Payment Files</h3>
            <button
              onClick={() => {
                setViewingFiles(null);
                setFiles([]);
              }}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
          <div className="space-y-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{file.file_name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.file_size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <a
                  href={file.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
