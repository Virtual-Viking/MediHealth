"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  insuranceAPI,
  InsurancePolicy,
  InsurancePolicySummary,
} from "@/services/api";

type PolicyMemberInput = {
  name: string;
  relationship: string;
  date_of_birth: string;
};

const MAX_FILES = 2;

const formatDate = (value: string | null | undefined): string => {
  if (!value) {
    return "N/A";
  }
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
};

const isPolicyActive = (policy: InsurancePolicy): boolean => {
  if (!policy.coverage_end) {
    return true;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(policy.coverage_end) >= today;
};

const emptyMember = (): PolicyMemberInput => ({
  name: "",
  relationship: "",
  date_of_birth: "",
});

export default function InsurancePage() {
  const [summary, setSummary] = useState<InsurancePolicySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await insuranceAPI.getSummary();
      setSummary(data);
      const firstActive = data.policies.find(isPolicyActive);
      setSelectedPolicyId(firstActive?.id ?? null);
    } catch (err: any) {
      setError(
        err.detail ||
          "Network error: Unable to reach server. Please check your connection and ensure the backend server is running."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const activePolicies = useMemo(() => {
    if (!summary?.policies?.length) {
      return [];
    }
    return summary.policies
      .filter(isPolicyActive)
      .sort((a, b) => {
        const aDate = a.coverage_end ? new Date(a.coverage_end).getTime() : 0;
        const bDate = b.coverage_end ? new Date(b.coverage_end).getTime() : 0;
        return aDate - bDate;
      });
  }, [summary]);

  useEffect(() => {
    if (!activePolicies.length) {
      setSelectedPolicyId(null);
      return;
    }

    if (!selectedPolicyId) {
      setSelectedPolicyId(activePolicies[0].id);
      return;
    }

    const stillExists = activePolicies.some(
      (policy) => policy.id === selectedPolicyId
    );
    if (!stillExists) {
      setSelectedPolicyId(activePolicies[0].id);
    }
  }, [activePolicies, selectedPolicyId]);

  const selectedPolicy = useMemo(() => {
    if (!selectedPolicyId) {
      return null;
    }
    return activePolicies.find((policy) => policy.id === selectedPolicyId) ?? null;
  }, [activePolicies, selectedPolicyId]);

  return (
    <main
      className="flex-1 p-4 overflow-y-auto"
      style={{ backgroundColor: "#ECF4F9" }}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Insurance</h1>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">Loading insurance records…</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={loadSummary}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <InsuranceStatusModule policy={activePolicies[0] ?? null} />
            <ActivePoliciesModule
              policies={activePolicies}
              selectedPolicyId={selectedPolicyId}
              onSelectPolicy={setSelectedPolicyId}
            >
              <PolicyDetails policy={selectedPolicy} />
            </ActivePoliciesModule>
            <AddPolicyModule
              open={showForm}
              toggle={() => setShowForm((prev) => !prev)}
              onPolicyCreated={async () => {
                setShowForm(false);
                await loadSummary();
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}

const InsuranceStatusModule = ({ policy }: { policy: InsurancePolicy | null }) => (
  <section className="bg-white rounded-lg shadow p-6">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Current Insurance Status</h2>
        <p className="text-sm text-gray-500">
          We determine status based on active policies and coverage end dates.
        </p>
      </div>
      {policy ? (
        <span className="px-4 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
                      Patient Insured
                    </span>
      ) : (
        <span className="px-4 py-1 rounded-full text-sm font-semibold bg-gray-200 text-gray-700">
          Not Insured
        </span>
      )}
    </div>

    {policy ? (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <StatusTile label="Insurance Provider" value={policy.insurer_name} />
        <StatusTile label="Policy Number" value={policy.policy_number} />
        <StatusTile
          label="Validity"
          value={`${formatDate(policy.coverage_start)} - ${formatDate(policy.coverage_end)}`}
        />
                  </div>
    ) : (
      <div className="text-center py-6 text-gray-500">No Insurance Found</div>
    )}
  </section>
);

const StatusTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
    <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-base font-semibold text-gray-900">{value}</p>
                    </div>
);

function ActivePoliciesModule({
  policies,
  selectedPolicyId,
  onSelectPolicy,
  children,
}: {
  policies: InsurancePolicy[];
  selectedPolicyId: string | null;
  onSelectPolicy: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Active Insurance Policies</h2>
        <p className="text-sm text-gray-500">
          Select an insurance policy from the list to see the complete details.
        </p>
                    </div>

      {policies.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
          <div className="p-4 space-y-2 max-h-[26rem] overflow-y-auto">
            {policies.map((policy) => {
              const isSelected = selectedPolicyId === policy.id;
              return (
                <button
                  key={policy.id}
                  onClick={() => onSelectPolicy(policy.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{policy.insurer_name}</p>
                      <p className="text-sm text-gray-600">{policy.policy_number}</p>
                    </div>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                      Active
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {formatDate(policy.coverage_start)} – {formatDate(policy.coverage_end)}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="p-6">{children}</div>
                </div>
              ) : (
        <div className="p-6 text-center text-gray-500">
          No active insurance policies found for this patient.
                </div>
              )}
    </section>
  );
}

const PolicyDetails = ({ policy }: { policy: InsurancePolicy | null }) => {
  if (!policy) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        Select an insurance policy to view its details.
              </div>
    );
  }

  return (
    <div className="space-y-5">
                        <div>
        <h3 className="text-xl font-semibold text-gray-900">{policy.insurer_name}</h3>
        {policy.plan_name && (
          <p className="text-sm text-gray-600">
            {policy.plan_name}
            {policy.group_number ? ` • Group ${policy.group_number}` : ""}
          </p>
                          )}
                        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DetailRow label="Insurance provider name" value={policy.insurer_name} />
        <DetailRow label="Policy number" value={policy.policy_number} />
        <DetailRow label="Insurance number" value={policy.insurance_number || "N/A"} />
        <DetailRow label="Cover amount" value={formatCurrency(policy.cover_amount)} />
        <DetailRow label="Start date" value={formatDate(policy.coverage_start)} />
        <DetailRow label="End date" value={formatDate(policy.coverage_end)} />
                          </div>

                          <div>
        <p className="text-sm font-medium text-gray-600">List of members in policy</p>
        {policy.policy_members?.length ? (
          <ul className="mt-2 space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
            {policy.policy_members.map((member, index) => (
              <li key={`${member.name}-${index}`}>
                                    {member.name}
                {member.relationship ? ` (${member.relationship})` : ""}
                {member.date_of_birth ? ` – DOB: ${formatDate(member.date_of_birth)}` : ""}
                                  </li>
                                ))}
                              </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No members recorded on this policy.</p>
        )}
                            </div>

                          <div>
        <p className="text-sm font-medium text-gray-600">Policy documents</p>
        {policy.policy_files?.length ? (
          <div className="mt-2 space-y-2">
            {policy.policy_files.map((file) => (
                                  <a
                                    key={file.id}
                                    href={file.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:border-blue-400"
              >
                <span>{file.file_name}</span>
                <span className="text-xs font-semibold">View document</span>
                                  </a>
                                ))}
                              </div>
                            ) : (
          <p className="mt-2 text-sm text-gray-500">
            No policy documents uploaded. Upload PDFs or images when adding a policy.
          </p>
                            )}
                          </div>
                        </div>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-gray-100 bg-white p-3">
    <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
                      </div>
);

function AddPolicyModule({
  open,
  toggle,
  onPolicyCreated,
}: {
  open: boolean;
  toggle: () => void;
  onPolicyCreated: () => Promise<void> | void;
}) {
  return (
    <section className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div>
                <h2 className="text-lg font-semibold text-gray-900">Add New Insurance Policy</h2>
          <p className="text-sm text-gray-500">
            Capture provider details, coverage dates, members, and upload up to two policy files.
          </p>
        </div>
                <button
          onClick={toggle}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
          {open ? "Close form" : "Add insurance policy"}
                </button>
              </div>
      {open && (
        <AddPolicyForm
          onCancel={toggle}
          onSuccess={onPolicyCreated}
                />
              )}
    </section>
  );
}

interface AddPolicyFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function AddPolicyForm({ onSuccess, onCancel }: AddPolicyFormProps) {
  const [formData, setFormData] = useState({
    insurer_name: "",
    plan_name: "",
    policy_number: "",
    group_number: "",
    insurance_number: "",
    coverage_start: "",
    coverage_end: "",
    cover_amount: "",
    is_primary: true,
  });
  const [policyMembers, setPolicyMembers] = useState<PolicyMemberInput[]>([
    emptyMember(),
  ]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = event.target;
    
    // Validate cover_amount to prevent numeric overflow
    if (name === "cover_amount" && value) {
      const numValue = parseFloat(value);
      if (numValue > 9999999999.99) {
        setError("Cover amount cannot exceed $9,999,999,999.99");
        return;
      } else {
        // Clear error if previously set for cover amount
        if (error?.includes("Cover amount")) {
          setError(null);
        }
      }
    }
    
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) {
        return;
      }
    const nextFiles = Array.from(event.target.files).slice(0, MAX_FILES);
    setFiles(nextFiles);
  };

  const updateMember = (index: number, key: keyof PolicyMemberInput, value: string) => {
    setPolicyMembers((prev) => {
      const clone = [...prev];
      clone[index] = { ...clone[index], [key]: value };
      return clone;
    });
  };

  const addMemberRow = () => {
    setPolicyMembers((prev) => [...prev, emptyMember()]);
  };

  const removeMemberRow = (index: number) => {
    setPolicyMembers((prev) => prev.filter((_, idx) => idx !== index));
  };

  const resetForm = () => {
    setFormData({
      insurer_name: "",
      plan_name: "",
      policy_number: "",
      group_number: "",
      insurance_number: "",
      coverage_start: "",
      coverage_end: "",
      cover_amount: "",
      is_primary: true,
    });
    setPolicyMembers([emptyMember()]);
    setFiles([]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    // Validate that at least one file is uploaded
    if (files.length === 0) {
      setError("At least one policy document is required. Please upload a document before submitting.");
      setSubmitting(false);
      return;
    }

    try {
      const membersPayload = policyMembers
        .filter((member) => member.name.trim().length > 0)
        .map((member) => ({
          name: member.name,
          relationship: member.relationship || undefined,
          date_of_birth: member.date_of_birth || undefined,
        }));

      const payload = {
        insurer_name: formData.insurer_name,
        plan_name: formData.plan_name || undefined,
        policy_number: formData.policy_number,
        group_number: formData.group_number || undefined,
        insurance_number: formData.insurance_number || undefined,
        coverage_start: formData.coverage_start || undefined,
        coverage_end: formData.coverage_end || undefined,
        cover_amount: formData.cover_amount
          ? parseFloat(formData.cover_amount)
          : undefined,
        is_primary: formData.is_primary,
        policy_members: membersPayload.length ? membersPayload : undefined,
      };

      await insuranceAPI.createPolicyWithFiles(payload, files);

      resetForm();
      onSuccess();
    } catch (err: any) {
      setError(
        err.detail || "Failed to create insurance policy. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Insurance provider name"
          required
            name="insurer_name"
            value={formData.insurer_name}
            onChange={handleInputChange}
          />
        <Field
          label="Plan name"
            name="plan_name"
            value={formData.plan_name}
            onChange={handleInputChange}
          />
        <Field
          label="Policy number"
          required
            name="policy_number"
            value={formData.policy_number}
            onChange={handleInputChange}
          />
        <Field
          label="Group number"
            name="group_number"
            value={formData.group_number}
            onChange={handleInputChange}
          />
        <Field
          label="Insurance number"
            name="insurance_number"
            value={formData.insurance_number}
            onChange={handleInputChange}
          />
        <Field
          label="Cover amount"
          name="cover_amount"
            type="number"
          min="0"
          max="9999999999.99"
          step="0.01"
            value={formData.cover_amount}
            onChange={handleInputChange}
          />
        <Field
          label="Start date"
          name="coverage_start"
            type="date"
            value={formData.coverage_start}
            onChange={handleInputChange}
          />
        <Field
          label="End date"
          name="coverage_end"
            type="date"
            value={formData.coverage_end}
            onChange={handleInputChange}
          />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            name="is_primary"
            checked={formData.is_primary}
            onChange={handleInputChange}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        Set as primary policy
        </label>

        <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Policy members</p>
          {policyMembers.map((member, index) => (
          <div
            key={`member-${index}`}
            className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 md:grid-cols-3"
          >
              <input
                type="text"
              placeholder="Member name"
                value={member.name}
              onChange={(event) => updateMember(index, "name", event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <input
                type="text"
                placeholder="Relationship"
                value={member.relationship}
              onChange={(event) =>
                updateMember(index, "relationship", event.target.value)
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                placeholder="Date of birth"
                  value={member.date_of_birth}
                onChange={(event) =>
                  updateMember(index, "date_of_birth", event.target.value)
                }
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                {policyMembers.length > 1 && (
                  <button
                    type="button"
                  onClick={() => removeMemberRow(index)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
          onClick={addMemberRow}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
          + Add member
          </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Policy documents (up to {MAX_FILES} files)
          <span className="text-red-600"> *</span>
        </label>
        <p className="text-xs text-gray-500">
          Accepted types: PDF, JPG, PNG, WEBP. Each file must be under 10 MB.
        </p>
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileChange}
          className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          required
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-green-600">
            {files.map((file) => (
              <li key={file.name}>
                ✓ {file.name} · {(file.size / 1024).toFixed(1)} KB
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={() => {
            resetForm();
            onCancel();
          }}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? "Saving..." : "Create policy"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="text-sm font-medium text-gray-700">
      <span>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        {...rest}
        type={type}
        name={name}
        required={required}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {name === "cover_amount" && (
        <p className="text-xs text-gray-500 mt-1">Maximum: $9,999,999,999.99</p>
      )}
    </label>
  );
}
