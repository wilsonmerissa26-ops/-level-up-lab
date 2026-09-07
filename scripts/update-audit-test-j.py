from pathlib import Path
p=Path('tests/audit-regression.test.mjs')
s=p.read_text()
old="assert.match(source, /function validAccessCondition\\(value\\)\\{return ACCESS_CONDITIONS\\.includes\\(value\\)\\?value:null\\}/); pass('unrecognized or unobserved access condition resolves to null');"
new="assert.match(source, /function validAccessCondition\\(value\\).*STATE_INTEGRITY.*validAccessCondition/); pass('access validation delegates to tested state-integrity helper');"
if old not in s:
    raise SystemExit('legacy access-validation assertion anchor missing')
p.write_text(s.replace(old,new,1))
print('Audit regression assertion updated for delegated helper')
