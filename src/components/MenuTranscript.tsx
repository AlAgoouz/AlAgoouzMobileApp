import React from 'react';
import {menuTranscript} from '../lib/menuTranscript';

const price = new Intl.NumberFormat('ar-EG');

export function MenuTranscript() {
  return (
    <div className="menu-transcript">
      {menuTranscript.sections.map(section => (
        <table key={section.title}>
          <caption>{section.title}</caption>
          <thead>
            <tr><th scope="col">الصنف</th>
              {section.columns.map(column => <th key={column} scope="col">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {section.rows.map(([name, ...prices]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {prices.map((amount, index) => <td key={section.columns[index]}>{amount === null ? 'غير مذكور' : price.format(amount)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <footer>
        <p>قد تختلف بعض الأسعار حسب السوق. تواصل معنا لمعرفة الأسعار المحدّثة.</p>
        <p>{menuTranscript.address}</p>
        <a href={`tel:${menuTranscript.phone}`}>للتواصل والطلبات <bdi>{menuTranscript.phoneText}</bdi></a>
      </footer>
    </div>
  );
}
