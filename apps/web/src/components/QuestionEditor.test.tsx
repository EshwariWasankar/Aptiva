import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuestionEditor } from './QuestionEditor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
import type * as ContentModule from '../lib/content';
vi.mock('../lib/content', async (importOriginal: () => Promise<ContentModule>) => {
  const mod = (await importOriginal()) as ContentModule;
  return {
    ...mod,
    adminCreateQuestion: vi.fn().mockResolvedValue({ id: 'new-id' }),
    adminUpdateQuestion: vi.fn().mockResolvedValue({}),
  };
});

import { adminCreateQuestion } from '../lib/content';

const createMock = vi.mocked(adminCreateQuestion);
const TOPICS = [
  {
    id: 't1',
    slug: 'percentages',
    name: 'Percentages',
    level: 'topic',
    parent: { id: 's1', slug: 'quant', name: 'Quantitative Aptitude' },
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuestionEditor', () => {
  it('renders create-mode fields and switches format sections', () => {
    render(<QuestionEditor question={null} topics={TOPICS} />);

    expect(screen.getByLabelText('Topic')).toBeTruthy();
    expect(screen.getByLabelText(/stem/i)).toBeTruthy();
    // MCQ is default → options editor visible.
    expect(screen.getByText(/options/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /numerical/i }));
    expect(screen.queryByText(/options/i)).toBeNull();
    expect(screen.getByText(/numeric answer/i)).toBeTruthy();
  });

  it('shows the KaTeX preview when a stem contains math', async () => {
    render(<QuestionEditor question={null} topics={TOPICS} />);
    fireEvent.change(screen.getByLabelText(/stem/i), {
      target: { value: 'Compute $2+2$ please' },
    });
    // KaTeX is lazy-imported; the math span appears asynchronously.
    await waitFor(() => expect(document.querySelector('.katex')).toBeTruthy());
  });

  it('submits an MCQ payload with options and source fields', async () => {
    render(<QuestionEditor question={null} topics={TOPICS} />);

    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText(/stem/i), { target: { value: '2+2=?' } });
    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'team' } });
    const optionInputs = screen.getAllByPlaceholderText(/option \d/i);
    ['3', '4', '5', '6'].forEach((v, i) =>
      fireEvent.change(optionInputs[i]!, { target: { value: v } }),
    );
    // Move correctness to the second row (first row is correct by default).
    const radios = screen.getAllByTitle('Mark correct');
    fireEvent.click(radios[1]!);

    fireEvent.click(screen.getByRole('button', { name: /create question/i }));

    await vi.waitFor(() => expect(createMock).toHaveBeenCalled());
    const body = createMock.mock.calls[0]![0];
    expect(body.topicId).toBe('t1');
    expect(body.format).toBe('mcq');
    expect(body.sourceName).toBe('team');
    expect(body.options).toHaveLength(4);
    expect(body.options?.filter((o) => o.isCorrect)).toHaveLength(1);
  });
});
