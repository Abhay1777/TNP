"""Remove the deterministic demo records seeded by migration 0014 in test contexts.

The historical migration is retained for existing installations. The test database
must be hermetic: migration 0014 creates demo students and 725 attendance rows,
which contaminate tests that expect an empty database. This cleanup runs when
TNP_CI_TEST=1 (CI) or DJANGO_SETTINGS_MODULE contains 'test_settings' (local pytest).
"""
import os

from django.db import migrations


DEMO_UIDS = [
    "24-IT-A01-28", "24-IT-A02-28", "24-IT-A03-28", "24-IT-A04-28",
    "24-IT-B05-28", "24-IT-B06-28", "23-IT-A07-27", "23-IT-A08-27",
    "23-IT-B09-27", "22-IT-A10-26", "24-CMPNA01-28", "24-CMPNA02-28",
    "24-CMPNB03-28", "23-CMPNA04-27", "22-COMPA05-26", "24-AI&DSA01-28",
    "24-AI&DSA02-28", "24-AI&DSB03-28", "23-AI&DSA04-27",
    "24-AIMLA01-28", "24-AIMLA02-28", "24-EXTCA01-28", "23-EXTCA02-27",
    "24-MECHA01-28", "24-MECHA02-28",
]


def remove_ci_demo_records(apps, schema_editor):
    is_ci = os.environ.get("TNP_CI_TEST") == "1"
    is_test = "test_settings" in os.environ.get("DJANGO_SETTINGS_MODULE", "")
    if not (is_ci or is_test):
        return

    db = schema_editor.connection.alias
    Student = apps.get_model("student", "Student")
    User = apps.get_model("base", "User")
    AttendanceData = apps.get_model("program_coordinator_api", "AttendanceData")
    Program1 = apps.get_model("program_coordinator_api", "Program1")
    BatchAttendance = apps.get_model("program_coordinator_api", "BatchAttendance")

    AttendanceData.objects.using(db).filter(uid__in=DEMO_UIDS).delete()
    Program1.objects.using(db).filter(UID__in=DEMO_UIDS).delete()
    # The only BatchAttendance rows created by migration 0014 are these
    # deterministic demo batches; tests start with an otherwise empty DB.
    BatchAttendance.objects.using(db).filter(batch__in=["2026", "2027", "2028"]).delete()

    emails = [
        f"{uid.lower().replace('&', '').replace('-', '.')}@tcetmumbai.in"
        for uid in DEMO_UIDS
    ]
    Student.objects.using(db).filter(uid__in=DEMO_UIDS).delete()
    User.objects.using(db).filter(email__in=emails).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("program_coordinator_api", "0014_seed_training_attendance"),
    ]

    operations = [
        migrations.RunPython(remove_ci_demo_records, migrations.RunPython.noop),
    ]
