const WIZ_STEPS = [
  "Basic Info", "Transport", "Invoices", "Customs & Compliance",
  "Documents", "Delivery Order & MOFAIC", "Physical Documents", "Review & Submit",
];

export function WizardStepIndicator({ currentStep, onStepClick }: { currentStep: number; onStepClick: (n: number) => void }) {
  return (
    <div className="flex overflow-x-auto border-b border-border">
      {WIZ_STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < currentStep;
        const active = n === currentStep;
        return (
          <button
            key={label}
            onClick={() => done && onStepClick(n)}
            disabled={!done}
            className={`flex-1 whitespace-nowrap border-b-[3px] px-1.5 py-2.5 text-[11.5px] font-semibold transition ${
              active ? "border-primary text-primary-dark" : done ? "border-transparent text-primary" : "border-transparent text-ink-muted"
            } ${done ? "cursor-pointer" : "cursor-default"}`}
          >
            <span
              className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] text-white ${
                done || active ? "bg-primary" : "bg-border"
              }`}
            >
              {done ? "✓" : n}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
