import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from base.models import User

test_users = [
    ("tnpclerk1@gmail.com", "staff", "TNP Clerk 1"),
    ("staff@tcetmumbai.in", "staff", "Staff Member"),
    ("placement_officer@tcetmumbai.in", "placement_officer", "Placement Officer"),
    ("internship_officer@tcetmumbai.in", "internship_officer", "Internship Officer"),
    ("training_officer@tcetmumbai.in", "training_officer", "Training Officer"),
    ("admin@tcetmumbai.in", "system_admin", "System Admin"),
]

for email, role, full_name in test_users:
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "full_name": full_name,
            "role": role,
            "is_staff": True,
            "is_superuser": (role == "system_admin"),
        }
    )
    user.role = role
    user.full_name = full_name
    user.is_staff = True
    user.is_superuser = (role == "system_admin")
    user.set_password("tcet@1234")
    user.save()
    print(f"[{'CREATED' if created else 'UPDATED'}] {email} (role: {role}) -> password: tcet@1234")

print("All staff user accounts are seeded and ready!")
