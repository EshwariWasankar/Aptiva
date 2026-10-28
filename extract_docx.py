import zipfile
import xml.etree.ElementTree as ET

docx_path = r'd:\Aptiva — End-to-End Implementation Guide.docx'

with zipfile.ZipFile(docx_path, 'r') as zip_ref:
    xml_content = zip_ref.read('word/document.xml')

root = ET.fromstring(xml_content)

# Define namespace
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

# Extract all text
texts = []
for elem in root.iter():
    if elem.tag.endswith('}t'):
        if elem.text:
            texts.append(elem.text)

with open('implementation_guide.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(texts))
print("Extracted to implementation_guide.txt")
