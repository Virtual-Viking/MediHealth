"use client";

import { PendingPaymentItem } from "@/services/api";
import Image from "next/image";

interface PaymentTimelineSectionProps {
  payments: PendingPaymentItem[];
  isDoctor?: boolean; // If true, shows "Paid by" instead of "Paid to"
}

export default function PaymentTimelineSection({ payments, isDoctor = false }: PaymentTimelineSectionProps) {
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    return `${dayName} ${month} ${day} ${year}`;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getDateLabel = (payment: PendingPaymentItem, index: number, allPayments: PendingPaymentItem[]): string | null => {
    // Use payment_updated_at for timeline ordering if available, otherwise use appointment_date
    const dateString = payment.payment_updated_at || payment.appointment_date;
    if (index === 0) return "Today";
    
    const currentDate = new Date(dateString);
    const previousPayment = allPayments[index - 1];
    const previousDateString = previousPayment.payment_updated_at || previousPayment.appointment_date;
    const previousDate = index > 0 ? new Date(previousDateString) : null;
    
    if (!previousDate) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const current = new Date(currentDate);
    current.setHours(0, 0, 0, 0);
    const previous = new Date(previousDate);
    previous.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((today.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return null; // Already marked as Today
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    
    // Only show label if different date from previous
    if (current.getTime() !== previous.getTime()) {
      return formatDate(dateString);
    }
    
    return null;
  };

  const getPaymentStatusBadge = (status: string | null | undefined) => {
    if (!status || status === "pending") {
      return <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
    }
    if (status === "completed" || status === "paid") {
      return <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">{isDoctor ? "Received" : "Paid"}</span>;
    }
    if (status === "failed") {
      return <span className="px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Failed</span>;
    }
    return <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{status}</span>;
  };

  const getPaymentIcon = (paymentMethod: string | null | undefined) => {
    if (paymentMethod === "online") {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    } else if (paymentMethod === "cheque") {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    } else if (paymentMethod === "insurance") {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <svg
          className="w-16 h-16 text-gray-300 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-gray-500">No transactions found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Payment Timeline</h2>
      
      {payments.map((payment, index) => {
        const dateLabel = getDateLabel(payment, index, payments);
        const isPaid = payment.payment_status === "completed" || payment.payment_status === "paid";
        const transactionDate = payment.payment_updated_at || payment.payment_created_at || payment.appointment_date;
        
        return (
          <div key={payment.appointment_id} className="relative">
            {/* Date Label */}
            {dateLabel && (
              <div className="flex justify-center mb-6">
                <span className="bg-blue-100 text-blue-800 px-6 py-1.5 rounded-full text-sm font-medium">
                  {dateLabel}
                </span>
              </div>
            )}

            <div className="flex gap-6 pb-8">
              {/* Date/Time */}
              <div className="w-32 text-right flex-shrink-0">
                <div className="text-blue-600 font-medium text-sm">{formatDate(transactionDate)}</div>
                <div className="text-blue-600 font-medium text-sm">{formatTime(transactionDate)}</div>
              </div>

              {/* Timeline Dot and Line */}
              <div className="relative flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${
                  isPaid ? "bg-green-500 ring-4 ring-green-100" : "bg-yellow-500 ring-4 ring-yellow-100"
                } z-10`}></div>
                {index < payments.length - 1 && (
                  <div className="w-0.5 h-full bg-blue-200 absolute top-3"></div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-2">
                <div className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    {/* Payment Method Icon */}
                    <div className={`p-2 rounded-lg ${
                      isPaid ? "bg-green-100 text-green-600" : "bg-yellow-100 text-yellow-600"
                    }`}>
                      {getPaymentIcon(payment.payment_method)}
                    </div>
                    
                    {/* Payment Details */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-gray-900">
                            Transaction APT{payment.appointment_id}
                          </span>
                          {getPaymentStatusBadge(payment.payment_status)}
                        </div>
                        <span className="text-lg font-bold text-gray-900">
                          {formatCurrency(payment.final_amount)}
                        </span>
                      </div>
                      
                      {/* Doctor/Patient Info */}
                      <div className="flex items-center gap-2 mb-3">
                        {payment.doctor_photo_url ? (
                          <Image
                            src={payment.doctor_photo_url}
                            alt={isDoctor ? payment.patient_name : payment.doctor_name}
                            width={24}
                            height={24}
                            className="rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">
                            👤
                          </div>
                        )}
                        <span className="text-sm text-gray-700">
                          {isDoctor ? "Paid by:" : "Paid to:"} <span className="font-medium">{isDoctor ? payment.patient_name : payment.doctor_name}</span>
                        </span>
                      </div>
                      
                      {/* Payment Info Grid */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Appointment Date:</span>
                          <span className="ml-2 font-medium text-gray-900">
                            {formatDate(payment.appointment_date)}
                          </span>
                        </div>
                        {payment.payment_updated_at && (
                          <div>
                            <span className="text-gray-600">Transaction Date:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {formatDate(payment.payment_updated_at)} {formatTime(payment.payment_updated_at)}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-600">Payment Method:</span>
                          <span className="ml-2 font-medium text-gray-900 uppercase">
                            {payment.payment_method || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Service:</span>
                          <span className="ml-2 font-medium text-gray-900">
                            {payment.service_name || "Consultation"}
                          </span>
                        </div>
                        {!isPaid && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Amount Due:</span>
                            <span className="ml-2 font-medium text-red-600">
                              {formatCurrency(payment.final_amount)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

