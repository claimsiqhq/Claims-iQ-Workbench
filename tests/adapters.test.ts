import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NutrientAdapter } from '@/lib/adapters/nutrient.adapter';
import type { Correction } from '@shared/schemas';

describe('NutrientAdapter', () => {
  let mockInstance: any;
  let adapter: NutrientAdapter;

  beforeEach(() => {
    mockInstance = {
      Annotations: Promise.resolve({
        HighlightAnnotation: vi.fn(),
        TextAnnotation: vi.fn(),
        StrikeOutAnnotation: vi.fn(),
        UnderlineAnnotation: vi.fn(),
        StampAnnotation: vi.fn(),
      }),
      Geometry: Promise.resolve({
        Rect: vi.fn((props) => props),
      }),
      getFormFields: vi.fn().mockResolvedValue([]),
      setFormFieldValues: vi.fn().mockResolvedValue(undefined),
      beginContentEditingSession: vi.fn().mockResolvedValue({
        getTextBlocks: vi.fn().mockResolvedValue([]),
        updateTextBlocks: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn().mockResolvedValue(undefined),
      }),
      create: vi.fn().mockResolvedValue({ id: 'test-id' }),
      search: vi.fn().mockResolvedValue([]),
    };

    adapter = new NutrientAdapter();
  });

  it('selects form_field strategy for corrections with form_field_name', async () => {
    await adapter.initialize(mockInstance);
    
    const correction: Correction = {
      id: 'test',
      type: 'typo',
      severity: 'info',
      location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } },
      found_value: 'test',
      expected_value: 'Test',
      confidence: 0.8,
      requires_human_review: false,
      recommended_action: 'auto_correct',
      evidence: { reasoning: 'test' },
      form_field_name: 'claimNumber',
      status: 'pending',
    };
    
    // Access private method via any cast for testing
    const strategies = (adapter as any).getStrategiesForCorrection(correction);
    expect(strategies[0]).toBe('form_field');
    expect(strategies[1]).toBe('content_edit');
    expect(strategies[2]).toBe('redaction_overlay');
  });
  
  it('selects content_edit first for date errors', async () => {
    await adapter.initialize(mockInstance);
    
    const correction: Correction = {
      id: 'test',
      type: 'date_error',
      severity: 'warning',
      location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } },
      found_value: '01/15/2023',
      expected_value: '01/15/2024',
      confidence: 0.9,
      requires_human_review: false,
      recommended_action: 'auto_correct',
      evidence: { reasoning: 'test' },
      status: 'pending',
    };
    
    const strategies = (adapter as any).getStrategiesForCorrection(correction);
    expect(strategies[0]).toBe('content_edit');
    expect(strategies[1]).toBe('redaction_overlay');
  });

  it('returns default strategy order for generic corrections', async () => {
    await adapter.initialize(mockInstance);
    
    const correction: Correction = {
      id: 'test',
      type: 'typo',
      severity: 'info',
      location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } },
      found_value: 'test',
      expected_value: 'Test',
      confidence: 0.8,
      requires_human_review: true,
      recommended_action: 'flag_for_review',
      evidence: { reasoning: 'test' },
      status: 'pending',
    };
    
    const strategies = (adapter as any).getStrategiesForCorrection(correction);
    expect(strategies[0]).toBe('content_edit');
    expect(strategies[1]).toBe('redaction_overlay');
  });
});
