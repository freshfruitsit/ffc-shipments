"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { WizardStepIndicator } from "@/components/wizard/wizard-step-indicator";
import { WizardStepSkeleton } from "@/components/wizard/wizard-step-skeleton";
import { Step1BasicInfo } from "@/components/wizard/step1-basic-info";

// Item 7 (performance): steps 2-8 used to all be eagerly bundled into the
// New Shipment route's initial JS, even though a user only ever sees step
// 1 on first load. Each of these now becomes its own chunk, fetched only
// once the wizard actually advances to it — defined at module scope (not
// inside the component) so the dynamic() wrapper itself isn't recreated
// on every render, which would otherwise defeat webpack's module caching.
const Step2Transport = dynamic(() => import("./step2-transport").then((m) => m.Step2Transport), { loading: () => <WizardStepSkeleton /> });
const Step3Invoices = dynamic(() => import("./step3-invoices").then((m) => m.Step3Invoices), { loading: () => <WizardStepSkeleton /> });
const Step4Documents = dynamic(() => import("./step4-documents").then((m) => m.Step4Documents), { loading: () => <WizardStepSkeleton /> });
const Step5Customs = dynamic(() => import("./step5-customs").then((m) => m.Step5Customs), { loading: () => <WizardStepSkeleton /> });
const Step6DeliveryMofaic = dynamic(() => import("./step6-delivery-mofaic").then((m) => m.Step6DeliveryMofaic), { loading: () => <WizardStepSkeleton /> });
const Step7PhysicalDocs = dynamic(() => import("./step7-physical-docs").then((m) => m.Step7PhysicalDocs), { loading: () => <WizardStepSkeleton /> });
const Step8Review = dynamic(() => import("./step8-review").then((m) => m.Step8Review), { loading: () => <WizardStepSkeleton /> });

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
  profiles: Option[];
  suppliers: Option[];
  deliveryOrderProfiles: Option[];
  mofaicProfiles: Option[];
  physicalDocsProfiles: Option[];
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
  function handleCreatedAndAdvance(id: string, ref: string) {
    setShipmentId(id);
    setShipmentRef(ref);
    goNext();
  }
  function handleCreatedAndExit(id: string) {
    setShipmentId(id);
    router.push(`/shipments/${id}/overview`);
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
            profiles={props.profiles}
            suppliers={props.suppliers}
            canAdministerSuppliers={props.canAdministerSuppliers}
            onCreatedAndAdvance={handleCreatedAndAdvance}
            onCreatedAndExit={handleCreatedAndExit}
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
          <Step5Customs shipmentId={shipmentId} onNext={goNext} onBack={goBack} onSaveAsDraft={handleSaveAsDraft} />
        )}
        {step === 5 && shipmentId && (
          <Step4Documents shipmentId={shipmentId} documentTypes={props.documentTypes} onNext={goNext} onBack={goBack} onSaveAsDraft={handleSaveAsDraft} />
        )}
        {step === 6 && shipmentId && (
          <Step6DeliveryMofaic
            shipmentId={shipmentId}
            carriers={props.carriers}
            currencies={props.currencies}
            deliveryOrderProfiles={props.deliveryOrderProfiles}
            mofaicProfiles={props.mofaicProfiles}
            onNext={goNext}
            onBack={goBack}
            onSaveAsDraft={handleSaveAsDraft}
          />
        )}
        {step === 7 && shipmentId && (
          <Step7PhysicalDocs
            shipmentId={shipmentId}
            couriers={props.couriers}
            profiles={props.physicalDocsProfiles}
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
