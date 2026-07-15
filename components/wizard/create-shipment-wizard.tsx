"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WizardStepIndicator } from "@/components/wizard/wizard-step-indicator";
import { Step1BasicInfo } from "@/components/wizard/step1-basic-info";
import { Step2Transport } from "@/components/wizard/step2-transport";
import { Step3Invoices } from "@/components/wizard/step3-invoices";
import { Step4Documents } from "@/components/wizard/step4-documents";
import { Step5Customs } from "@/components/wizard/step5-customs";
import { Step6DeliveryMofaic } from "@/components/wizard/step6-delivery-mofaic";
import { Step7PhysicalDocs } from "@/components/wizard/step7-physical-docs";
import { Step8Review } from "@/components/wizard/step8-review";

type Option = { id: string; name: string };

export function CreateShipmentWizard(props: {
  userId: string;
  branches: Option[];
  fixedBranchId: string | null;
  categories: Option[];
  countries: Option[];
  airlines: Option[];
  ports: Option[];
  freightAgents: Option[];
  clearingAgents: Option[];
  carriers: Option[];
  couriers: Option[];
  documentTypes: Option[];
  currencies: string[];
  suppliers: Option[];
  profiles: Option[];
  canAdministerSuppliers: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [shipmentRef, setShipmentRef] = useState<string | null>(null);

  function goNext() {
    setStep((s) => Math.min(8, s + 1));
  }
  function goBack() {
    setStep((s) => Math.max(1, s - 1));
  }
  function goToStep(n: number) {
    setStep(n);
  }
  function handleCreated(id: string, ref: string) {
    setShipmentId(id);
    setShipmentRef(ref);
    goNext();
  }
  function handleSaveAsDraft() {
    if (shipmentId) router.push(`/shipments/${shipmentId}/overview`);
    else router.push("/shipments");
  }
  function handleFinish() {
    if (shipmentId) router.push(`/shipments/${shipmentId}/overview`);
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <WizardStepIndicator currentStep={step} onStepClick={goToStep} />

      <div className="p-6">
        {step === 1 && (
          <Step1BasicInfo
            userId={props.userId}
            branches={props.branches}
            fixedBranchId={props.fixedBranchId}
            categories={props.categories}
            countries={props.countries}
            suppliers={props.suppliers}
            profiles={props.profiles}
            canAdministerSuppliers={props.canAdministerSuppliers}
            onCreated={handleCreated}
            onSaveAsDraft={handleSaveAsDraft}
          />
        )}
        {step === 2 && shipmentId && (
          <Step2Transport
            shipmentId={shipmentId}
            airlines={props.airlines}
            ports={props.ports}
            freightAgents={props.freightAgents}
            clearingAgents={props.clearingAgents}
            onNext={goNext}
            onBack={goBack}
            onSaveAsDraft={handleSaveAsDraft}
          />
        )}
        {step === 3 && shipmentId && (
          <Step3Invoices shipmentId={shipmentId} currencies={props.currencies} onNext={goNext} onBack={goBack} onSaveAsDraft={handleSaveAsDraft} />
        )}
        {step === 4 && shipmentId && (
          <Step4Documents shipmentId={shipmentId} documentTypes={props.documentTypes} onNext={goNext} onBack={goBack} onSaveAsDraft={handleSaveAsDraft} />
        )}
        {step === 5 && shipmentId && (
          <Step5Customs shipmentId={shipmentId} onNext={goNext} onBack={goBack} onSaveAsDraft={handleSaveAsDraft} />
        )}
        {step === 6 && shipmentId && (
          <Step6DeliveryMofaic
            shipmentId={shipmentId}
            carriers={props.carriers}
            currencies={props.currencies}
            profiles={props.profiles}
            onNext={goNext}
            onBack={goBack}
            onSaveAsDraft={handleSaveAsDraft}
          />
        )}
        {step === 7 && shipmentId && (
          <Step7PhysicalDocs
            shipmentId={shipmentId}
            couriers={props.couriers}
            profiles={props.profiles}
            onNext={goNext}
            onBack={goBack}
            onSaveAsDraft={handleSaveAsDraft}
          />
        )}
        {step === 8 && shipmentId && shipmentRef && (
          <Step8Review shipmentId={shipmentId} shipmentRef={shipmentRef} onBack={goBack} onFinish={handleFinish} />
        )}
      </div>
    </div>
  );
}
