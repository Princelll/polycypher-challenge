import requests

url = "https://3ogn9nt6a3.execute-api.us-east-2.amazonaws.com/prod/api/contact"

data = {
    "source": "contact",
    "name": "Jose Eduardo Praiz Mendez",
    "email": "praiz.eduardo@gmail.com",
    "organization": "",
    "interest": "research",
    "message": (
        "Hello PolyCypher team! I am a physician with clinical-genomics "
        "training (ACMG variant interpretation, rare disease, NGS) applying "
        "for the Research Scientist / Bioinformatics Innovator role. I "
        "completed your command-line challenge as my first step. I bring "
        "clinical judgment for disease prediction model validation and am "
        "building my computational skills in Python and bioinformatics. "
        "Looking forward to contributing to your mission of predicting "
        "diseases before they occur. - Eduardo Praiz Mendez, MD"
    )
}

response = requests.post(url, json=data)
print(response.status_code)
print(response.text)