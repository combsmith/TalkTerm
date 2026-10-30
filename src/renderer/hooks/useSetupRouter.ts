import { useState, useCallback } from 'react';
import type { SetupStep } from '../../shared/types/domain/launch-state';

export interface UseSetupRouterReturn {
  currentStep: SetupStep;
  goToStep: (step: SetupStep) => void;
  completeCurrentStep: () => void;
}

const STEP_ORDER: SetupStep[] = [
  'needs-key',
  'needs-profile',
  'needs-workspace',
  'needs-avatar',
  'ready',
];

export function useSetupRouter(initialStep: SetupStep = 'needs-key'): UseSetupRouterReturn {
  const [currentStep, setCurrentStep] = useState<SetupStep>(initialStep);

  const goToStep = useCallback((step: SetupStep): void => {
    setCurrentStep(step);
  }, []);

  const completeCurrentStep = useCallback((): void => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    const nextStep = STEP_ORDER[currentIndex + 1];
    if (nextStep !== undefined) {
      setCurrentStep(nextStep);
    }
  }, [currentStep]);

  return { currentStep, goToStep, completeCurrentStep };
}
