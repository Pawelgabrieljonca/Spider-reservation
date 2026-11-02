import sys
from app.core.database import db_session, engine
from sqlalchemy import inspect, text

sys.stdout.reconfigure(encoding='utf-8')

inspector = inspect(engine)
tables = inspector.get_table_names()

print("=== TABELE W BAZIE POSTGRESQL (spider_db) ===")
for t in sorted(tables):
    print(f"\n[TABELA: {t}]")
    cols = inspector.get_columns(t)
    for c in cols:
        nullable = "NULL" if c['nullable'] else "NOT NULL"
        pk = " (PK)" if c.get('primary_key') else ""
        print(f"  - {c['name']} : {c['type']} {nullable}{pk}")
    
    fks = inspector.get_foreign_keys(t)
    for fk in fks:
        print(f"    FK: {fk['constrained_columns']} -> {fk['referred_table']}.{fk['referred_columns']}")

    uqs = inspector.get_unique_constraints(t)
    for uq in uqs:
        print(f"    UNIQUE: {uq['name']} -> {uq['column_names']}")

