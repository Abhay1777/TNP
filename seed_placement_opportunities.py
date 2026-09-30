import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from placements.models import Company, PlacementOpportunity

print("Seeding Companies and Placement Opportunities into Database...")

sample_opportunities = [
    {
        "company_name": "Tata Consultancy Services",
        "company_website": "https://careers.tcs.com",
        "designation": "Software Engineer (Ninja & Digital)",
        "batch": "2027",
        "eligibility_criteria": "BE / B.Tech (COMP, IT, AI&DS, EXTC) with min 60% aggregate in 10th, 12th & Graduation. Max 1 active backlog.",
        "skills": ["Java", "Python", "SQL", "Data Structures", "Problem Solving"],
        "about": "Tata Consultancy Services is an IT services, consulting and business solutions organization that has been partnering with many of the world's largest businesses in their transformation journeys for over 50 years.",
        "selection_process": "1. TCS NQT Online Test\n2. Technical Interview\n3. HR Interview",
    },
    {
        "company_name": "Infosys Limited",
        "company_website": "https://www.infosys.com/careers.html",
        "designation": "Specialist Programmer & Systems Engineer",
        "batch": "2027",
        "eligibility_criteria": "BE/B.Tech (All Branches) with CGPA >= 6.5 throughout academics. No active backlogs allowed at the time of drive.",
        "skills": ["C++", "Java", "Web Technologies", "DBMS", "Cloud Basics"],
        "about": "Infosys is a global leader in next-generation digital services and consulting, enabling clients in more than 56 countries to navigate their digital transformation.",
        "selection_process": "1. HackWithInfy / Online Assessment\n2. Technical & HR Interview",
    },
    {
        "company_name": "Accenture India",
        "company_website": "https://www.accenture.com/in-en/careers",
        "designation": "Advanced Application Engineering Analyst",
        "batch": "2027",
        "eligibility_criteria": "BE/B.Tech (COMP, IT, AI&DS, ETRX, EXTC) with min 60% or 6.5 CGPA with no active backlogs.",
        "skills": ["JavaScript", "Python", "SQL", "Cloud", "Agile"],
        "about": "Accenture is a leading global professional services company, providing a broad range of services in strategy, consulting, digital, technology and operations.",
        "selection_process": "1. Cognitive & Technical Assessment\n2. Coding Assessment\n3. Communication Assessment\n4. Interview",
    },
    {
        "company_name": "LTI Mindtree",
        "company_website": "https://www.ltimindtree.com/careers/",
        "designation": "Graduate Engineer Trainee",
        "batch": "2027",
        "eligibility_criteria": "BE/B.Tech COMP, IT, AI&DS with CGPA >= 6.0 and no year gap during graduation.",
        "skills": ["Java", "Python", "Spring Boot", "React", "SQL"],
        "about": "LTIMindtree is a global technology consulting and digital solutions company that enables enterprises across industries to reimagine business models and accelerate innovation.",
        "selection_process": "1. Online Aptitude & Coding Test\n2. Technical Interview\n3. HR Discussion",
    },
    {
        "company_name": "Deloitte US-India",
        "company_website": "https://www2.deloitte.com/ui/en/careers.html",
        "designation": "Analyst - Risk & Financial Advisory",
        "batch": "2027",
        "eligibility_criteria": "BE/B.Tech (COMP, IT, AI&DS) with min 65% throughout 10th, 12th & B.Tech. No backlogs.",
        "skills": ["Python", "Data Analytics", "Cyber Security", "SQL", "Cloud Architecture"],
        "about": "Deloitte provides audit, consulting, financial advisory, risk advisory, tax and related services to public and private clients spanning multiple industries.",
        "selection_process": "1. Online Assessment (Aptitude + Technical)\n2. Case Study / Group Discussion\n3. Personal Interview",
    }
]

for item in sample_opportunities:
    company, _ = Company.objects.get_or_create(
        name=item["company_name"],
        defaults={
            "website": item["company_website"],
            "description": item["about"],
        }
    )
    
    opp, created = PlacementOpportunity.objects.get_or_create(
        company=company,
        designation=item["designation"],
        batch=item["batch"],
        defaults={
            "eligibility_criteria": item["eligibility_criteria"],
            "skills": item["skills"],
            "selection_process": item["selection_process"],
        }
    )
    
    print(f"[{'CREATED' if created else 'EXISTING'}] Opportunity: {company.name} - {opp.designation} (Batch {opp.batch})")

print("All sample placement opportunities seeded successfully!")
