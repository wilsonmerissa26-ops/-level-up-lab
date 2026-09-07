from pathlib import Path
p=Path('scripts/apply-patch-k.py')
s=p.read_text()
old="""rep('''isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,pushEvidenceOnce''',
    '''isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,pushEvidenceOnce,sameOriginRedundancyDegraded''',
    'audit exports')"""
new="""rep('''maybeFinalizeTrackAMastery}};''',
    '''maybeFinalizeTrackAMastery,sameOriginRedundancyDegraded}};''',
    'audit exports')"""
if old not in s:
    raise SystemExit('Patch K generator audit-export block not found')
p.write_text(s.replace(old,new,1))
print('Patch K generator anchor fixed')
