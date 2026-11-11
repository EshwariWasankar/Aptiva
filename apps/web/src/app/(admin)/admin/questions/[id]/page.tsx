'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QuestionEditor } from '../../../../../components/QuestionEditor';
import { ApiError } from '../../../../../lib/apiClient';
import {
  adminGetQuestion,
  adminListTopics,
  type Question,
  type TopicNode,
} from '../../../../../lib/content';

export default function QuestionEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await adminListTopics().catch(() => [] as TopicNode[]);
        if (cancelled) return;
        setTopics(t);
        if (id === 'new') {
          setState('ready');
          return;
        }
        const q = await adminGetQuestion(id);
        if (cancelled) return;
        setQuestion(q);
        setState('ready');
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setState('missing');
        else setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === 'loading') return <p className="text-neutral-500">Loading…</p>;
  if (state === 'missing') return <p className="text-neutral-600">Question not found.</p>;
  if (state === 'error') return <p className="text-red-700">Failed to load the question.</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{question ? 'Edit question' : 'New question'}</h1>
      {question && (
        <p className="text-sm text-neutral-500">
          id {question.id} · stem_hash {question.stemHash.slice(0, 12)}… · elo{' '}
          {Math.round(question.eloRating)}
        </p>
      )}
      <QuestionEditor question={question} topics={topics} />
    </div>
  );
}
